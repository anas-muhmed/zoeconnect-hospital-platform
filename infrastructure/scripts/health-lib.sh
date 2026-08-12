#!/bin/bash
# ==============================================================================
# HDSP deployment — shared health/readiness verification helpers
# ==============================================================================
#
# Sourced (never executed) by both deploy.sh and rollback.sh. Narrowly
# scoped to ONE concern — verifying the Compose stack actually converged to
# a genuinely healthy state — not a general "move everything into one
# lib.sh" refactor (that was explicitly deferred earlier and stays
# deferred). This file exists because of a real, observed incident:
#
#   ── The 2026-08 "split-state deployment" incident ──────────────────────
#   `docker compose ls` showed TWO projects running simultaneously (the
#   real "hdsp" project and a shadow "release-<sha>" project from a bare
#   `docker compose up -d` run without an explicit project name — see
#   docker-compose.yml's own "Project identity" comment for that root
#   cause, fixed separately). hdsp-postgres / hdsp-redis / vendor-postgres
#   sat in "Created" state, never actually started, while hdsp-backend was
#   running (under the correct project) and vendor-backend / hdsp-nginx
#   were running under the FOREIGN project. Backend logs showed
#   `getaddrinfo ENOTFOUND hdsp-postgres` — yet `/api/v1/health/live`
#   returned 200 OK the entire time, because liveness only proves the
#   Node process is alive, not that it can reach anything it depends on.
#   That let the deployment believe it had succeeded.
#
# The two root causes this file fixes:
#   1. Every health signal this deployment ever consulted — the backend's
#      own Docker HEALTHCHECK, Compose's depends_on: condition:
#      service_healthy chains, AND deploy.sh's own verify_health() step —
#      all ultimately traced back to the SAME liveness endpoint. Fixing
#      that in one place (pointing all three at a real readiness endpoint
#      that actually checks Postgres/Redis) fixes all three layers at
#      once. See app.controller.ts's `/health/ready` (already existed,
#      was simply never consulted by anything) and the analogous new
#      readiness endpoint added to vendor-portal/backend.
#   2. A curl-based check against a host port can be satisfied by ANY
#      process listening on that port — including a foreign container
#      squatting it, exactly as happened here. verify_container_state()
#      below resolves the ACTUAL container Compose has for a given
#      service in THIS project and asserts its real state directly (via
#      `docker inspect`), before any HTTP check is even attempted.
#
# On the relationship between this file and `docker compose up -d --wait`:
# they are complementary, not redundant. `--wait` is still what deploy.sh/
# rollback.sh use to bring the app tier up -- Compose owns container
# lifecycle (start order, its own HEALTHCHECK polling) and this script does
# not reimplement or second-guess that. What this file adds is everything
# AFTER `--wait` returns: (1) verify_container_state()'s own poll is a
# defense-in-depth re-confirmation, useful specifically because `--wait`
# can return success based on Docker's HEALTHCHECK, which -- before this
# round of fixes -- was itself pointed at a liveness-only endpoint; and
# (2) verify_readiness()/verify_service_health() check business-level
# readiness (can this application actually serve traffic), which is simply
# outside what `docker compose up --wait` was ever designed to know about.
# Let Docker handle container lifecycle; let the application prove
# business readiness on top of that -- this file is the second half.
#
# Depends on the caller having already exported COMPOSE_PROJECT_NAME and
# COMPOSE_FILE. Log output goes through log_info/log_warn/log_error if the
# caller defines them (deploy.sh does), or falls back to a plain `echo`
# with a bracketed level prefix (rollback.sh's own existing convention) —
# see _hlib_log() below.
# ==============================================================================

_hlib_log() {
    local level="$1"; shift
    local fn="log_${level}"
    if declare -F "$fn" > /dev/null 2>&1; then
        "$fn" "$*"
    else
        local upper
        upper=$(echo "$level" | tr '[:lower:]' '[:upper:]')
        echo "[${upper}] $*"
    fi
}

# --- Container-state verification (not just curl) ---------------------------
# Resolves the container Compose has for <service> in the current project
# and asserts it is genuinely Running (and, if it declares a HEALTHCHECK,
# Docker-healthy).
#
# Semantics are deliberately split in two, not just "retry until timeout":
#   - Exited / Dead is a DEFINITIVE failure -- returned immediately, no
#     retries. Retrying a dead container for a full timeout window before
#     reporting it (what a bare curl-retry loop effectively does) only
#     delays a known-bad outcome and wastes the deploy's time budget.
#   - Running-but-still-inside-start_period ("starting") or a container
#     that hasn't been created at all yet is treated as "still converging"
#     and polled, bounded by max_wait.
verify_container_state() {
    local service="$1"
    local max_wait="${2:-90}"
    local interval=3
    local waited=0

    while true; do
        local cid
        cid=$(docker compose ps -q "$service" 2>/dev/null | head -n1)

        if [ -n "$cid" ]; then
            local state health
            state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
            health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "unknown")

            case "$state" in
                exited|dead)
                    _hlib_log error "verify_container_state: service '${service}' container ${cid:0:12} is in state '${state}' -- a definitive failure, not retrying. Recent logs:"
                    docker logs --tail 30 "$cid" 2>&1 | sed 's/^/    /' >&2 || true
                    return 1
                    ;;
                running)
                    if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                        # "none" = this service declares no HEALTHCHECK at
                        # all -- Running is the only signal available, and
                        # is sufficient for it.
                        _hlib_log info "verify_container_state: service '${service}' container ${cid:0:12} is Running (health: ${health})."
                        return 0
                    fi
                    if [ "$health" = "unhealthy" ]; then
                        _hlib_log error "verify_container_state: service '${service}' container ${cid:0:12} is Running but Docker reports its HEALTHCHECK as 'unhealthy'. Recent logs:"
                        docker logs --tail 30 "$cid" 2>&1 | sed 's/^/    /' >&2 || true
                        return 1
                    fi
                    # health == "starting" -- still inside start_period,
                    # keep polling.
                    ;;
                # "created" (never started) and "restarting" (mid crash
                # loop -- will surface as exited/dead on a later poll if
                # it really is looping) both fall through to the
                # keep-polling path below, bounded by max_wait.
            esac
        fi

        if [ "$waited" -ge "$max_wait" ]; then
            _hlib_log error "verify_container_state: timed out after ${max_wait}s waiting for service '${service}' to become Running/healthy (container: ${cid:-<none created>}, last state: ${state:-n/a}, health: ${health:-n/a})."
            return 1
        fi
        sleep "$interval"
        waited=$((waited + interval))
    done
}

# --- Stateful-tier verification ----------------------------------------------
# Explicitly, independently confirms every service named in the array
# variable whose NAME is passed as $1 is Running/healthy. Called BEFORE the
# application tier is touched, so a database/cache problem is reported as
# exactly that -- distinctly -- rather than surfacing later as a generic
# app-tier `--wait` timeout, or (worse, per the incident) not surfacing at
# all because the only thing checking was a liveness endpoint that never
# looks at Postgres/Redis to begin with.
verify_stateful_tier() {
    local -n _svc_ref="$1"
    local max_wait="${2:-90}"
    local failed=()
    local svc
    for svc in "${_svc_ref[@]}"; do
        if ! verify_container_state "$svc" "$max_wait"; then
            failed+=("$svc")
        fi
    done
    if [ "${#failed[@]}" -gt 0 ]; then
        _hlib_log error "Stateful-tier verification failed for: ${failed[*]}. Refusing to proceed to the application tier -- starting app services against a database/cache layer that isn't confirmed healthy is exactly how a backend ends up running with no real Postgres/Redis behind it (see this file's header comment)."
        return 1
    fi
    _hlib_log info "Stateful tier verified healthy: ${_svc_ref[*]}"
    return 0
}

# --- Application-level readiness verification --------------------------------
# Only meaningful AFTER verify_container_state() has already confirmed the
# container itself is Running/Docker-healthy. This is an independent,
# additional confirmation via the app's own readiness HTTP endpoint
# (deliberately /health/ready, never /health/live -- see this file's header
# comment for why liveness is insufficient), reached the same way real
# traffic would reach it (localhost:<published-port>), which incidentally
# also re-confirms the published port is bound to the container this
# script just verified, not to something else answering on the same port.
verify_readiness() {
    local name="$1"
    local url="$2"
    local retries="${3:-20}"
    local wait="${4:-5}"

    _hlib_log info "Verifying readiness for ${name} at ${url}"
    while [ "$retries" -gt 0 ]; do
        if curl -sSf "$url" > /dev/null 2>&1; then
            _hlib_log info "${name} is ready."
            return 0
        fi
        retries=$((retries - 1))
        sleep "$wait"
    done
    _hlib_log error "Readiness check failed for ${name} at ${url} (checked AFTER container-state verification already passed -- the container is Running/Docker-healthy, but the application itself is still reporting not-ready; check its logs)."
    return 1
}

# --- Combined per-service check ----------------------------------------------
# What deploy.sh/rollback.sh actually call for each app-tier service:
# container state first (fails fast on a definitively dead container
# instead of wasting a full retry budget on it), readiness endpoint
# second. Pass url="" to skip the HTTP layer for a service with no
# meaningful readiness endpoint of its own (container-state is then the
# whole check).
verify_service_health() {
    local service="$1"     # Compose service name, e.g. "hdsp-backend"
    local name="$2"        # human-readable label for logging
    local url="$3"         # readiness URL, or "" to skip the HTTP layer
    local max_wait="${4:-90}"

    if ! verify_container_state "$service" "$max_wait"; then
        return 1
    fi
    if [ -n "$url" ]; then
        if ! verify_readiness "$name" "$url" 20 5; then
            return 1
        fi
    fi
    return 0
}

# --- Failure diagnostic bundle -----------------------------------------------
# Concise, single-call diagnostic dump for any deployment failure, so a
# human doesn't have to re-run `docker compose ps` / `docker inspect` /
# `docker logs` by hand one at a time to reconstruct what happened -- the
# information that would otherwise take several manual round-trips to the
# host is emitted once, right where the failure was detected.
#
# $1 = name of an array variable (nameref) containing "service|Label|url"
#      triples -- the SAME service/name/url tuples deploy.sh/rollback.sh
#      pass to verify_service_health(). url may be empty ("service|Label|")
#      for a service with no readiness endpoint of its own.
# $2 = OPTIONAL name of an array variable (nameref) listing exactly the
#      services that belong to THIS run's active DEPLOYMENT_MODE profile
#      (deploy.sh/rollback.sh pass ACTIVE_PROFILE_SERVICES). When given,
#      the per-service deep-dive sections (health detail, logs) are
#      scoped to only those services -- CRITICAL FIX (self_hosted/cloud
#      audit, 2026-08): without this, the deep-dive derived its own
#      service list from `docker compose ps --all`, which reflects every
#      container that happens to EXIST for this Compose project
#      (profiles only gate `up`/`pull`/`config --services`, not `ps`
#      visibility) -- so a leftover vendor-backend container from an
#      earlier cloud-mode run on the same host would get pulled into a
#      self_hosted deploy's failure diagnostics, which is exactly the
#      kind of "diagnostics inspecting containers outside the active
#      deployment mode" this audit flagged. If $2 is omitted, falls back
#      to the old `docker compose ps --all`-derived behavior (kept for
#      any external caller that hasn't been updated to pass it).
#
# Four sections, in order: container states (docker compose ps -- this top
# summary line intentionally stays unfiltered/`--all`, since seeing "there
# IS an unexpected leftover container" is itself useful operator context),
# per-service state+health (docker inspect, profile-scoped), last 50 log
# lines per service (profile-scoped), and a fresh readiness probe of every
# URL in the map (re-probed at diagnostic time, not just reporting
# whatever the last verify_readiness() call happened to see -- useful when
# the failure was in the stateful tier and the app tier was never even
# reached, so "not attempted" is itself informative).
emit_failure_diagnostics() {
    local -n _diag_map_ref="$1"

    _hlib_log error "=================== Deployment Failure Diagnostics ==================="

    _hlib_log error "--- Container states (docker compose ps --all) ---"
    docker compose ps --all --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' 2>&1 | sed 's/^/    /' >&2 || true

    local all_services
    if [ -n "${2:-}" ]; then
        local -n _diag_active_ref="$2"
        all_services=("${_diag_active_ref[@]}")
    else
        mapfile -t all_services < <(docker compose ps --all --format '{{.Service}}' 2>/dev/null | sort -u)
    fi

    _hlib_log error "--- Health detail (docker inspect) ---"
    local svc cid state health
    for svc in "${all_services[@]}"; do
        [ -z "$svc" ] && continue
        cid=$(docker compose ps -q "$svc" 2>/dev/null | head -n1)
        if [ -z "$cid" ]; then
            _hlib_log error "    ${svc}: <no container -- never created>"
            continue
        fi
        state=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
        health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "unknown")
        _hlib_log error "    ${svc}: state=${state} health=${health} container=${cid:0:12}"
    done

    _hlib_log error "--- Last 50 log lines per service ---"
    for svc in "${all_services[@]}"; do
        [ -z "$svc" ] && continue
        cid=$(docker compose ps -q "$svc" 2>/dev/null | head -n1)
        [ -z "$cid" ] && continue
        _hlib_log error "    [${svc}] (${cid:0:12}):"
        docker logs --tail 50 "$cid" 2>&1 | sed 's/^/        /' >&2 || true
    done

    _hlib_log error "--- Readiness results (probed now, single attempt each) ---"
    local entry svc_key label url
    for entry in "${_diag_map_ref[@]}"; do
        IFS='|' read -r svc_key label url <<< "$entry"
        if [ -z "$url" ]; then
            _hlib_log error "    ${label}: <no readiness URL -- container-state only>"
            continue
        fi
        if curl -sSf --max-time 5 "$url" > /dev/null 2>&1; then
            _hlib_log error "    ${label}: OK (${url})"
        else
            _hlib_log error "    ${label}: FAILED (${url})"
        fi
    done

    _hlib_log error "========================================================================"
}
