#!/bin/bash
set -Eeuo pipefail

# ==============================================================================
# HDSP Oracle Cloud Deployment Script
# ==============================================================================
#
# ── Deployment lifecycle (architecture note) ────────────────────────────────
# Exactly ONE Compose project ("hdsp") owns every container this system
# ever runs, for the lifetime of the host -- not one project per release.
# Each release directory under /opt/hdsp/releases carries its own copy of
# docker-compose.yml (pinning that release's image tags), but "deploying" a
# new release means recreating THAT SAME project's application-tier
# containers in place (scoped `--force-recreate`, see below), never
# spinning up a second, parallel project. True blue/green (two fully live
# projects/stacks simultaneously, cut over via a load balancer) was
# considered and deliberately rejected: it's structurally incompatible with
# "exactly one Compose project owns the deployment," and doubles resource
# usage and cutover complexity for a single-host deployment that doesn't
# need it. Project identity is guaranteed two independent ways -- this
# script's own `COMPOSE_PROJECT_NAME=hdsp` export below, AND
# docker-compose.yml's own `name: hdsp` key -- specifically so a single
# missed export (e.g. a manual `docker compose` command run by hand from
# inside a release directory) can't silently spin up a shadow project
# under that directory's basename (see docker-compose.yml's and
# detect_foreign_project_containers()'s comments for the full incident this
# was fixed after). Postgres/Redis are never part of the recreate target
# list, ever -- they're touched only implicitly via `depends_on`.
#
# --- Configuration ---
DEPLOY_ROOT="/opt/hdsp"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
CURRENT_LINK="${DEPLOY_ROOT}/current"
LOGS_DIR="${DEPLOY_ROOT}/logs"
BACKUPS_DIR="${DEPLOY_ROOT}/backups"

# --- Configuration from Manifest ---
# The deployment bundle contains a manifest.yml describing the release.
# release.short_sha is the single canonical field for THIS release's own
# commit identifier -- used for release-directory naming/logging only.
# manifest-lib.sh (also bundled, same directory as this script) is the one
# place both this field and the five independent per-service image tags
# below are actually extracted from the file -- see its own header comment.
SCRIPT_DIR_EARLY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR_EARLY}/manifest-lib.sh"
# health-lib.sh (also bundled, same directory as this script) is the shared
# stateful-tier / container-state / readiness verification logic used by
# both deploy.sh and rollback.sh -- see its own header comment for the
# split-state-deployment incident it exists to prevent from recurring.
source "${SCRIPT_DIR_EARLY}/health-lib.sh"

MANIFEST_FILE="$(cd "${SCRIPT_DIR_EARLY}/../.." && pwd)/manifest.yml"
if [ -f "$MANIFEST_FILE" ]; then
    export IMAGE_TAG=$(extract_release_short_sha "$MANIFEST_FILE")
    if [ -z "$IMAGE_TAG" ]; then
        echo -e "\033[0;31m[ERROR]\033[0m $(date +'%Y-%m-%d %H:%M:%S') - manifest.yml found at ${MANIFEST_FILE} but 'short_sha:' is missing or empty. Refusing to fall back to 'latest' — that would silently deploy the wrong image versions. The bundle may be corrupted or from an incompatible pipeline version." >&2
        exit 1
    fi
    export HDSP_VERSION="${IMAGE_TAG}"
    export SHORT_SHA="${IMAGE_TAG}"

    # CRITICAL FIX (incremental-build audit): docker-compose.yml used to
    # tag all 5 app-tier images with this ONE shared value -- correct only
    # as long as every deploy rebuilt all 5 in lockstep. Now that the CI
    # pipeline can skip rebuilding a service whose inputs didn't change,
    # each image needs its OWN independently-resolved tag (package-bundle's
    # resolve_tag() already guarantees each is a real, valid, previously-
    # pushed tag -- never empty, never "latest" -- whether this service was
    # rebuilt this run or not). Validated the same way short_sha is above:
    # a missing field fails loudly rather than silently falling back.
    export BACKEND_VERSION=$(extract_image_tag "$MANIFEST_FILE" backend)
    export FRONTEND_VERSION=$(extract_image_tag "$MANIFEST_FILE" frontend)
    export VENDOR_BACKEND_VERSION=$(extract_image_tag "$MANIFEST_FILE" vendor_backend)
    export VENDOR_FRONTEND_VERSION=$(extract_image_tag "$MANIFEST_FILE" vendor_frontend)
    export ZOECONNECT_VERSION=$(extract_image_tag "$MANIFEST_FILE" zoeconnect)
    for _pair in "BACKEND_VERSION:$BACKEND_VERSION" "FRONTEND_VERSION:$FRONTEND_VERSION" "VENDOR_BACKEND_VERSION:$VENDOR_BACKEND_VERSION" "VENDOR_FRONTEND_VERSION:$VENDOR_FRONTEND_VERSION" "ZOECONNECT_VERSION:$ZOECONNECT_VERSION"; do
        _name="${_pair%%:*}"
        _value="${_pair#*:}"
        if [ -z "$_value" ]; then
            echo -e "\033[0;31m[ERROR]\033[0m $(date +'%Y-%m-%d %H:%M:%S') - manifest.yml found at ${MANIFEST_FILE} but the per-service tag for '${_name}' is missing. Refusing to fall back to 'latest'. The bundle may be corrupted or from an incompatible pipeline version." >&2
            exit 1
        fi
    done
    unset _pair _name _value
else
    # Fallback to env vars for backward compatibility (e.g. a manual run
    # without a bundled manifest). Not expected during normal CI-driven
    # deployments, where manifest.yml is always present. All five
    # per-service versions collapse to this one shared tag here, matching
    # this fallback path's original (pre-incremental-build) behavior.
    export IMAGE_TAG="${IMAGE_TAG:-latest}"
    export SHORT_SHA="$(echo ${IMAGE_TAG} | cut -c1-7)"
    export HDSP_VERSION="${SHORT_SHA}"
    export BACKEND_VERSION="${HDSP_VERSION}"
    export FRONTEND_VERSION="${HDSP_VERSION}"
    export VENDOR_BACKEND_VERSION="${HDSP_VERSION}"
    export VENDOR_FRONTEND_VERSION="${HDSP_VERSION}"
    export ZOECONNECT_VERSION="${HDSP_VERSION}"
fi

export REGISTRY="${REGISTRY:-git.zoeconnect.in}"
export IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-hdsp}"

# --- Logging Macros ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date +'%Y-%m-%d %H:%M:%S') - $1"; }

# --- Trap for automatic cleanup & rollback ---
PREVIOUS_RELEASE=""
if [ -L "${CURRENT_LINK}" ]; then
    PREVIOUS_RELEASE=$(readlink "${CURRENT_LINK}")
fi

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Deployment failed with exit code $exit_code."
        ROLLBACK_STATUS="not_attempted"
        if [ -n "$PREVIOUS_RELEASE" ] && [ "$PREVIOUS_RELEASE" != "${RELEASE_DIR:-}" ]; then
            log_warn "Triggering automatic rollback to $PREVIOUS_RELEASE"
            # CRITICAL FIX: previously `... rollback.sh ... || true`, which
            # silently swallowed ANY rollback failure (permission denied,
            # a bad target release, a compose failure — anything) with no
            # distinct logging. Rollback is the safety net for a failed
            # deploy; a safety net that can fail silently isn't one. Now
            # its exit code is captured explicitly and surfaced loudly,
            # both in the console log and in deployments.log, so it's
            # never ambiguous whether the automatic rollback actually
            # worked versus merely "the original deploy failed."
            # HDSP_SKIP_LOCK=1: this process still holds the exclusive
            # /opt/hdsp/.deploy.lock flock (released later, at the end of
            # this cleanup()) — rollback.sh acquiring its OWN fd on the same
            # lock file here would deadlock against ourselves (a fresh `exec
            # 9>` in the child closes its inherited copy of our fd and opens
            # an independent file description, so its flock attempt would
            # see the file as already held and fail immediately). Real
            # mutual exclusion is already guaranteed transitively by us
            # still holding the lock for this rollback's entire duration;
            # rollback.sh only needs to acquire it itself for standalone/
            # manual invocations.
            if HDSP_SKIP_LOCK=1 "${RELEASE_DIR:-$(pwd)}/infrastructure/scripts/rollback.sh" "$(basename "$PREVIOUS_RELEASE")"; then
                log_success "Automatic rollback to $PREVIOUS_RELEASE completed successfully."
                ROLLBACK_STATUS="succeeded"
            else
                ROLLBACK_ERR=$?
                log_error "AUTOMATIC ROLLBACK ALSO FAILED (exit $ROLLBACK_ERR) while rolling back to $PREVIOUS_RELEASE. The system may be left in a partially-deployed or inconsistent state — manual intervention required immediately."
                ROLLBACK_STATUS="failed"
            fi
        fi
        echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') | FAILED | ${IMAGE_TAG} | $(basename "${RELEASE_DIR:-unknown}") | rollback=${ROLLBACK_STATUS}" >> "${LOGS_DIR}/deployments.log" || true
    else
        echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') | SUCCESS | ${IMAGE_TAG} | $(basename "${RELEASE_DIR:-unknown}")" >> "${LOGS_DIR}/deployments.log" || true
    fi
    log_info "Ensuring registry logout..."
    docker logout "${REGISTRY}" || true
    
    log_info "Releasing deployment lock..."
    flock -u 9 || true
    rm -f "${DEPLOY_ROOT}/.deploy.lock" || true
}
trap cleanup EXIT

# --- Deployment Lock ---
log_info "Acquiring deployment lock..."
LOCK_FILE="${DEPLOY_ROOT}/.deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    # Check if process is actually running
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
        log_warn "Found stale lock file referencing dead PID $LOCK_PID. The kernel already releases flock automatically when its holding process dies, so re-attempting acquisition now..."
        # HIGH FIX: previously fell through here without ever re-attempting
        # flock, just assuming ownership was now ours. That's wrong on two
        # counts: (1) the PID read from the lock FILE's content is only
        # whatever a past run last wrote there — it's not the same thing as
        # asking the kernel who currently holds the flock, so this check
        # can be stale or simply wrong; (2) even in the genuinely-stale
        # case, never re-acquiring means we proceed without any actual
        # kernel-enforced exclusivity guarantee. Re-acquire for real; if it
        # still fails, something (possibly a different, live process) does
        # genuinely hold the lock, and we must not proceed unprotected.
        if ! flock -n 9; then
            log_error "Lock is still held after detecting a stale PID — a live process (possibly with a different PID than recorded) genuinely holds it. Exiting rather than risk running unprotected."
            trap - EXIT
            exit 1
        fi
        log_info "Lock re-acquired successfully after stale-PID recovery."
    else
        log_error "Another deployment is already in progress (PID: $LOCK_PID). Exiting."
        # Unset trap so it doesn't trigger rollback or log failure for a skipped run
        trap - EXIT
        exit 1
    fi
fi
echo $$ >&9

# --- Validation ---
log_info "Validating environment..."
log_info "Docker version: $(docker --version)"
log_info "Docker Compose version: $(docker compose version)"
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    log_error "Docker Compose plugin is not installed."
    exit 1
fi

if [ -z "${REGISTRY_USERNAME:-}" ] || [ -z "${REGISTRY_PASSWORD:-}" ]; then
    log_error "Registry credentials (REGISTRY_USERNAME / REGISTRY_PASSWORD) are missing."
    exit 1
fi

# 1. Layout Initialization
log_info "Initializing deployment layout..."
mkdir -p "${RELEASES_DIR}" "${LOGS_DIR}" "${BACKUPS_DIR}"

# The CI action unpacks the tarball into a release directory and then calls that specific deploy.sh.
# Determine our own release directory based on script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source environment configuration.
# CRITICAL FIX (release-immutability architecture, 2026-08): this used to
# ALSO `ln -sfn` a copy of this file into RELEASE_DIR, because
# docker-compose.yml's `env_file:` directives used to be a bare relative
# `.env.production` (resolved against the compose file's own directory --
# i.e. the release directory). That write mutated the release directory's
# mtime on every single deploy, which is exactly what let rollback.sh's
# equivalent write silently corrupt release-ordering discovery elsewhere in
# the pipeline (see deploy.yml's "Fetch previous release manifest" step and
# this script's own release-pruning cleanup below, both fixed alongside
# this). docker-compose.yml's `env_file:` entries are now absolute paths
# pointing directly at ${ENV_FILE} -- no per-release copy or symlink is
# needed at all anymore. Release directories are never written to by this
# script after extraction; they are read-only for their entire lifetime.
ENV_FILE="${DEPLOY_ROOT}/.env.production"
if [ -f "${ENV_FILE}" ]; then
    # Source the environment variables cleanly (still needed for this
    # script's own shell-level use of these vars, e.g. compose variable
    # interpolation via the inherited process environment).
    set -a
    source "${ENV_FILE}"
    set +a
else
    log_error "No .env.production found in ${DEPLOY_ROOT}! Deployment cannot proceed without environment variables."
    exit 1
fi

# Verify checksums before deployment
if [ -f "${RELEASE_DIR}/CHECKSUMS" ]; then
    log_info "Verifying bundle checksums..."
    (cd "${RELEASE_DIR}" && sha256sum -c CHECKSUMS) || { log_error "Checksum verification failed! Bundle corrupted."; exit 1; }
fi

export DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-self_hosted}"
BASE_COMPOSE="${RELEASE_DIR}/docker-compose.yml"
OVERRIDE="${RELEASE_DIR}/docker-compose.override.${DEPLOYMENT_MODE}.yml"

export COMPOSE_FILE="${BASE_COMPOSE}:${OVERRIDE}"
export COMPOSE_PROJECT_NAME="hdsp"

if [ ! -f "${BASE_COMPOSE}" ] || [ ! -f "${OVERRIDE}" ]; then
    log_error "Compose files not found at ${COMPOSE_FILE}! Script must be run from within a valid deployment bundle."
    exit 1
fi

log_info "Using compose file: ${COMPOSE_FILE}"
log_info "Release directory: ${RELEASE_DIR}"

# --- Active Compose profile selection (self_hosted vs cloud audit, 2026-08) --
# CRITICAL FIX: every `docker compose` invocation in this script used to
# hardcode `--profile full` unconditionally, regardless of $DEPLOYMENT_MODE.
# `full` includes BOTH the Hospital Platform (`hospital` profile:
# hdsp-postgres/hdsp-redis/hdsp-backend/hdsp-frontend) AND the Vendor
# Portal (`vendor` profile: vendor-postgres/vendor-backend/vendor-frontend)
# tiers -- so a self_hosted deployment was silently starting, force-
# recreating, health-checking, and rolling back vendor-portal containers
# it was never meant to run. `docker-compose.override.cloud.yml` adding
# `zoeconnect` (also `profiles: [full]`) was the only piece that was ever
# actually mode-conditional -- vendor-* was not.
#
# Fix: select the profile set from DEPLOYMENT_MODE. `hospital` +`proxy`
# for self_hosted (hdsp-nginx's own profile is `[proxy, full]`, NOT
# `hospital` -- it must be requested explicitly or self_hosted would lose
# its reverse proxy, a real regression); `full` for cloud (unchanged
# behavior -- still everything, including zoeconnect via the cloud
# override and vendor-*). `docker compose` accepts multiple `--profile`
# flags and unions the matched services, so this is a strict narrowing for
# self_hosted, not a behavior change for cloud.
if [ "$DEPLOYMENT_MODE" = "cloud" ]; then
    ACTIVE_PROFILES=(full)
else
    ACTIVE_PROFILES=(hospital proxy)
fi
PROFILE_FLAGS=()
for _p in "${ACTIVE_PROFILES[@]}"; do
    PROFILE_FLAGS+=(--profile "$_p")
done
unset _p
log_info "DEPLOYMENT_MODE=${DEPLOYMENT_MODE} -> active Compose profile(s): ${ACTIVE_PROFILES[*]}"

# Resolved ONCE, here, and reused everywhere below (guards, migrations,
# stateful/app-tier split, port checks, readiness checks) -- a service's
# profile membership is a static property of DEPLOYMENT_MODE for the
# duration of this run, so there is no need to re-invoke `docker compose
# config` more than once, and reusing a single resolved list guarantees
# every downstream check agrees on exactly the same service set.
mapfile -t ACTIVE_PROFILE_SERVICES < <(docker compose "${PROFILE_FLAGS[@]}" config --services)
if [ "${#ACTIVE_PROFILE_SERVICES[@]}" -eq 0 ]; then
    log_error "No services resolved for profile(s) '${ACTIVE_PROFILES[*]}' from 'docker compose config --services' -- refusing to proceed, this looks like a compose config problem rather than a normal deploy."
    exit 1
fi
is_active_service() {
    # $1 = service name to test for membership in ACTIVE_PROFILE_SERVICES.
    local needle="$1" hay
    for hay in "${ACTIVE_PROFILE_SERVICES[@]}"; do
        [ "$needle" = "$hay" ] && return 0
    done
    return 1
}

# --- Port-ownership guard's expected-port list, now profile-aware -------
# CRITICAL FIX: this used to be a flat literal list including 3010/4000/
# 4001 (zoeconnect/vendor-backend/vendor-frontend) UNCONDITIONALLY -- so a
# self_hosted deploy was checking for port conflicts on ports it was never
# going to bind itself, which is harmless in isolation (a no-op if nothing
# is listening there) but is exactly the kind of "cloud-only assumption
# leaked into common code" this audit is checking for, and it silently
# masked the fact that vendor-* was actually running under self_hosted too
# (see PROFILE_FLAGS fix above). Now driven by SERVICE_HOST_PORT + actual
# profile membership -- a port is only checked if the service that
# publishes it is actually part of THIS run's active profile.
declare -A SERVICE_HOST_PORT=(
    [hdsp-frontend]=3000
    [hdsp-backend]=3001
    [zoeconnect]=3010
    [vendor-backend]=4000
    [vendor-frontend]=4001
)
EXPECTED_HOST_PORTS=("${NGINX_HTTP_PORT:-80}" "${NGINX_HTTPS_PORT:-443}")  # hdsp-nginx -- active in both hospital+proxy and full
for _svc in hdsp-frontend hdsp-backend zoeconnect vendor-backend vendor-frontend; do
    if is_active_service "$_svc"; then
        EXPECTED_HOST_PORTS+=("${SERVICE_HOST_PORT[$_svc]}")
    fi
done
unset _svc

# 2. Login
log_info "Authenticating to ${REGISTRY}..."
echo "${REGISTRY_PASSWORD}" | docker login "${REGISTRY}" -u "${REGISTRY_USERNAME}" --password-stdin

# --- Container-name-conflict guard ---
# CRITICAL FIX: root-caused a repeating class of failure where `docker
# compose ... up -d` hit "Conflict: name already in use" / "removal of
# container ... is already in progress" against hdsp-backend/vendor-backend
# (and once, vendor-postgres). Root cause: this compose file used to pin a
# fixed `container_name:` per service (now removed -- see
# docker-compose.yml's "Container naming" note), and Docker's recreate path
# (stop old -> remove old -> create new) is not fully synchronous end to
# end -- dockerd can still be finishing a container's teardown
# asynchronously after the `up -d` CLI call that triggered it has already
# returned, especially on this host's block storage. The very next `up -d`
# invocation touching that same service -- a retry, or deploy.sh's own
# automatic rollback firing moments later from cleanup() -- could race
# straight into that still-finishing removal. Removing the fixed name
# closes most of this (Compose's own default per-project naming avoids the
# collision), but this guard is defense in depth against any container
# still genuinely mid-removal from *anything* that touched this compose
# project recently -- including a manual intervention, not just this
# script. It deliberately does NOT attempt to force-remove anything itself:
# one of those containers could be Postgres or Redis left in an unexpected
# state by something outside this deploy, and this deployment must never
# take an automated destructive action against a stateful service. It
# waits, and if the state doesn't clear, it fails loudly so a human
# investigates with full context instead of the deploy silently racing it.
wait_for_clean_compose_state() {
    local max_wait=60
    local waited=0
    local interval=2
    while true; do
        local stuck
        stuck=$(docker ps -a \
            --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
            --format '{{.Names}}\t{{.State}}' \
            | awk -F'\t' '$2 == "removing" || $2 == "dead" { print $1 }')
        if [ -z "$stuck" ]; then
            return 0
        fi
        if [ "$waited" -ge "$max_wait" ]; then
            log_error "Timed out after ${max_wait}s waiting for these containers to leave a removing/dead state: $stuck"
            log_error "Not attempting to force-remove them -- one or more may be a stateful service (Postgres/Redis) left in an unexpected state by something outside this deployment (a prior interrupted run, a manual intervention, a Docker daemon hiccup). Investigate with 'docker inspect <name>' before retrying; do not force-remove a database container without understanding why it's stuck."
            return 1
        fi
        log_warn "Waiting for these containers to finish a prior removal before proceeding (${waited}s/${max_wait}s): $stuck"
        sleep "$interval"
        waited=$((waited + interval))
    done
}

# --- Shadow-Compose-project guard ---
# CRITICAL FIX (deployment-architecture audit): this deployment's whole
# model depends on exactly ONE Compose project ("hdsp") owning every
# container across every release. That guarantee used to rest ENTIRELY on
# every invocation of `docker compose` explicitly setting the project name
# -- which this script does, but nothing enforced it anywhere else. A
# single manual `docker compose up -d` run from inside a release directory
# (e.g. while troubleshooting) with no `-p`/`COMPOSE_PROJECT_NAME` falls
# through to Compose's default project name: the directory's own basename
# -- e.g. "release-20260806110954-a835376". That silently spins up a
# second, fully independent Compose project this script has no visibility
# into via any project-scoped command (`docker compose ps` etc.), whose
# containers keep running, keep holding the same host ports, and (since
# `hdsp_net` is an `external: true` network with a fixed literal name)
# join the exact same Docker network as the real deployment -- and if that
# shadow project's own Postgres service ever started, it did so against a
# brand-new, empty, project-scoped volume, completely disconnected from
# the real `hdsp_hdsp_postgres_data` volume.
#
# `docker-compose.yml` now also declares `name: hdsp` directly (Compose
# precedence: -p flag > COMPOSE_PROJECT_NAME env > this file's `name:` >
# directory-basename fallback), which closes the hole at its root -- even
# a bare `docker compose up -d` now resolves to the correct project. This
# function is the second, independent layer: it actively looks for any
# currently-running container claiming to be one of THIS deployment's
# services but living under a DIFFERENT project name, and refuses to
# proceed if it finds one. Never auto-removes anything it finds, for the
# same reason wait_for_clean_compose_state() doesn't: it has no way to
# know whether that container holds real data.
detect_foreign_project_containers() {
    # Reuses the ACTIVE_PROFILE_SERVICES already resolved once above (from
    # this run's actual DEPLOYMENT_MODE-selected profile flags) instead of
    # re-invoking `docker compose config --services` with its own
    # hardcoded `--profile full` -- that old hardcoding meant this guard
    # checked vendor-*/zoeconnect for foreign-project conflicts even
    # during a self_hosted run that was never going to touch them itself.
    local foreign_found=false
    local svc
    for svc in "${ACTIVE_PROFILE_SERVICES[@]}"; do
        [ -z "$svc" ] && continue
        local matches
        matches=$(docker ps -a \
            --filter "label=com.docker.compose.service=${svc}" \
            --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}' \
            | awk -F'\t' -v want="${COMPOSE_PROJECT_NAME}" '$2 != want { print $0 }')
        if [ -n "$matches" ]; then
            foreign_found=true
            log_error "Container(s) for service '${svc}' found under a DIFFERENT Compose project than expected ('${COMPOSE_PROJECT_NAME}'):"
            while IFS=$'\t' read -r cname cproj; do
                log_error "    ${cname}   (project: ${cproj:-<none/manual run>})"
                # CRITICAL FIX (incident follow-up, 2026-08): this used to
                # stop at printing the name/project and tell the human to go
                # run 'docker inspect'/'docker volume ls' themselves as a
                # separate step -- a real incident (deploy AND its automatic
                # rollback both refusing on the exact same foreign project)
                # showed that round-trip costs real time while the system is
                # already down. Everything below is strictly read-only
                # (never removes/stops/modifies anything) and answers the
                # one question that actually gates the human's next
                # decision: does this container mount anything besides an
                # anonymous/ephemeral volume? If every mount shown is empty
                # or clearly non-persistent (nothing under this project's
                # known named volumes), that's strong evidence it's safe to
                # reconcile; if it shows a real named volume, that's the
                # signal to stop and investigate further before doing
                # anything destructive.
                local _insp
                if _insp=$(docker inspect "$cname" 2>/dev/null); then
                    log_error "        image:    $(echo "$_insp" | grep -m1 '"Image":' | sed -E 's/.*"Image": *"([^"]*)".*/\1/')"
                    log_error "        created:  $(echo "$_insp" | grep -m1 '"Created":' | sed -E 's/.*"Created": *"([^"]*)".*/\1/')"
                    log_error "        state:    $(docker inspect -f '{{.State.Status}} (health: {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}})' "$cname" 2>/dev/null || echo "unknown")"
                    local _mounts _mline
                    _mounts=$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}} (rw={{.RW}}){{"\n"}}{{end}}' "$cname" 2>/dev/null)
                    if [ -n "$_mounts" ]; then
                        log_error "        mounts:"
                        while IFS= read -r _mline; do
                            [ -z "$_mline" ] && continue
                            log_error "          - ${_mline}"
                        done <<< "$_mounts"
                    else
                        log_error "        mounts:   (none)"
                    fi
                else
                    log_error "        (docker inspect failed for ${cname} -- it may have been removed between listing and inspection; re-run 'docker ps -a' to check current state)"
                fi
            done <<< "$matches"
        fi
    done
    if [ "$foreign_found" = true ]; then
        log_error "Refusing to proceed: a shadow Compose project is holding container(s) that would conflict with this deployment's names/ports/network. This deploy will NOT attempt to remove them automatically -- one of them may be holding real data on a volume this project doesn't know about. Mount info for each foreign container is dumped above (read-only, nothing was touched) -- if every mount shown is empty or non-persistent, it is very likely safe to run 'docker compose -p <foreign-project-name> down' deliberately, by a human, to reconcile it; if any mount shows a real named volume, stop and investigate with 'docker volume inspect <name>' before doing anything further."
        return 1
    fi
    return 0
}

# --- Port-ownership guard ---
# detect_foreign_project_containers() above catches a foreign container
# claiming to be one of OUR services under the wrong project. It can't
# catch a container that isn't running under Compose's labels at all --
# e.g. a plain `docker run -p 4000:4000 ...` started by hand, with no
# compose labels whatsoever. That still occupies the port and produces the
# exact same class of failure ("Bind for 0.0.0.0:4000 failed"), just
# without anything to match on by service name. This checks port ownership
# directly instead: for each host port this deployment needs, is anything
# ALREADY bound to it that isn't part of the "hdsp" project (regardless of
# whether it has compose labels at all)? EXPECTED_HOST_PORTS itself is
# built earlier, above (profile-aware -- see that block's comment).
detect_port_conflicts() {
    local port
    local conflict_found=false
    for port in "${EXPECTED_HOST_PORTS[@]}"; do
        [ -z "$port" ] && continue
        local matches
        # Only RUNNING containers actually hold the OS-level port binding
        # right now -- a stopped container with a matching port mapping in
        # its own config isn't blocking anything, so no `-a` here
        # (deliberately different from detect_foreign_project_containers(),
        # which does want stopped/removing containers too).
        matches=$(docker ps \
            --filter "publish=${port}" \
            --format '{{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.project"}}')
        [ -z "$matches" ] && continue
        while IFS=$'\t' read -r cid cname cproj; do
            [ -z "$cid" ] && continue
            if [ "${cproj:-}" != "${COMPOSE_PROJECT_NAME}" ]; then
                conflict_found=true
                log_error "Port ${port} is already occupied by container ${cid} (${cname})."
                log_error "Container is not part of project '${COMPOSE_PROJECT_NAME}' (project: ${cproj:-<none -- not a Compose container at all>})."
            fi
        done <<< "$matches"
    done
    if [ "$conflict_found" = true ]; then
        log_error "Deployment aborted -- one or more required host ports are held by a container outside this project. Not attempting to stop/remove it automatically: identify what it is with 'docker inspect <id>' before deciding how to reconcile it."
        return 1
    fi
    return 0
}

# Run all three guards as early as possible -- before pull/migrations, not just
# right before `up -d` -- since a shadow project sharing the external
# hdsp_net network is a risk for migrations too (Docker's embedded DNS
# resolving a service hostname like "hdsp-postgres" ambiguously if two
# projects both register that alias on the same shared network is exactly
# the kind of thing that must never be allowed to reach a migration run).
# Called again immediately before `up -d` below as a second, final check,
# since pull/migrations can take long enough for state to change.
if ! detect_foreign_project_containers; then
    exit 1
fi
if ! detect_port_conflicts; then
    exit 1
fi
if ! wait_for_clean_compose_state; then
    log_error "Aborting before touching any containers -- see the warning above."
    exit 1
fi

# 2a. Pre-deployment Docker Cleanup
# This temporary cleanup prevents 'no space left on device' failures during
# the docker pull phase by proactively freeing space before the pull starts.
perform_pre_docker_cleanup() {
    log_info "Starting pre-deployment Docker cleanup..."
    
    log_info "Current Docker disk usage (Before Cleanup):"
    docker system df || log_warn "Failed to retrieve Docker disk usage."

    log_info "Removing stopped containers..."
    docker container prune -f || log_warn "Failed to remove stopped containers."

    log_info "Removing unused images..."
    docker image prune -af || log_warn "Failed to remove unused images."

    log_info "Removing build cache..."
    docker builder prune -af || log_warn "Failed to remove build cache."

    log_info "Pre-deployment cleanup completed."
    
    log_info "Current Docker disk usage (After Cleanup):"
    docker system df || log_warn "Failed to retrieve Docker disk usage."
}

perform_pre_docker_cleanup

# 3. Pull Images with Retries
# CRITICAL FIX (self_hosted/cloud audit, 2026-08): now pulls only the
# active profile's images (PROFILE_FLAGS) -- a self_hosted deploy no
# longer pulls vendor-backend/vendor-frontend images it will never run.
pull_images() {
    local max_attempts=3
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        log_info "Pulling images (Attempt $attempt/$max_attempts)..."
        if docker compose "${PROFILE_FLAGS[@]}" pull; then
            return 0
        fi
        log_warn "Pull failed. Retrying in 5 seconds..."
        sleep 5
        attempt=$((attempt + 1))
    done
    return 1
}

if ! pull_images; then
    log_error "Failed to pull images after retries."
    exit 1
fi

# 4. Migrations
# CRITICAL FIX (self_hosted/cloud audit, 2026-08): vendor-migrate used to
# run unconditionally, regardless of DEPLOYMENT_MODE -- a self_hosted
# deploy was running Vendor Portal database migrations against
# vendor-postgres even though nothing in that deployment mode was ever
# going to start vendor-postgres/vendor-backend afterward. hdsp-migrate
# stays unconditional: the Hospital Platform tier runs in BOTH modes
# (self_hosted's "hospital" profile always includes it), so this is
# genuinely common infrastructure, not a cloud-only assumption.
log_info "Running database migrations..."
if ! docker compose --profile migration run --rm hdsp-migrate; then
    log_error "HDSP Migration failed!"
    exit 1
fi
if is_active_service "vendor-postgres"; then
    if ! docker compose --profile migration run --rm vendor-migrate; then
        log_error "Vendor Migration failed!"
        exit 1
    fi
else
    log_info "Skipping Vendor Portal migrations -- vendor-postgres is not part of the active profile (DEPLOYMENT_MODE=${DEPLOYMENT_MODE})."
fi

# 5. Start Containers
# CRITICAL FIX: previously a bare `docker compose --profile full up -d`,
# which let Compose decide -- per service, per its own config-hash diff --
# what to recreate, with no guarantee about the state of anything still
# settling from a moment ago (see wait_for_clean_compose_state()'s comment
# above) and no guarantee that "up -d returned" means every recreated
# container is actually healthy yet (a bare `up -d` returns once containers
# are *started*, not once they pass their HEALTHCHECK).
#
# Now a deliberate three-part sequence:
#   1. wait_for_clean_compose_state() -- don't even attempt to touch
#      anything while a previous removal might still be finishing.
#   2. Explicitly enumerate every service the ACTIVE profile(s) for this
#      run's DEPLOYMENT_MODE would touch (PROFILE_FLAGS/ACTIVE_PROFILE_SERVICES,
#      resolved earlier -- see that block's comment), MINUS the stateful
#      ones (Postgres/Redis) -- built from Compose's own resolved config
#      rather than a hand-maintained list, so a new app-tier service added
#      later is covered automatically without anyone needing to remember
#      to update a list here.
#   3. `--force-recreate` targeted at ONLY that application-tier list,
#      `--wait` so this step doesn't return until Compose itself confirms
#      every one of them is not just started but HEALTHY (every app-tier
#      service already has a HEALTHCHECK -- Dockerfile-level for the
#      backends, compose-level for hdsp-nginx). `--force-recreate` is
#      deliberate here, not just "up -d and hope Compose's diff-based
#      recreate takes the fully-synchronous path": it guarantees Compose
#      always issues a full stop+remove+create for these specific
#      containers rather than any more surgical in-place path, which is
#      the exact guarantee needed to stop racing dockerd's own async
#      teardown. The "wasted work" downside of force-recreate (recreating
#      even when config is unchanged) barely applies here: every deploy
#      ships a brand-new SHA-tagged image anyway.
#   STATEFUL_SERVICES is never passed to --force-recreate and is never
#   named explicitly at all in this command -- Postgres/Redis are only
#   ever touched implicitly via `depends_on` (started if not already
#   running, left completely alone if already running and healthy, which
#   is the case on every normal redeploy). This is what guarantees data
#   safety: there is no code path here that can recreate a database
#   container as a side effect of an application deploy.
STATEFUL_SERVICES=(hdsp-postgres hdsp-redis vendor-postgres)

# Re-check all three guards immediately before touching any containers --
# pull and migrations above can take long enough for state to have changed
# since the early check.
if ! detect_foreign_project_containers; then
    exit 1
fi
if ! detect_port_conflicts; then
    exit 1
fi
if ! wait_for_clean_compose_state; then
    log_error "Aborting before touching any containers -- see the warning above."
    exit 1
fi

# Reuses ACTIVE_PROFILE_SERVICES resolved once, earlier -- no second
# `docker compose config --services` call, and (self_hosted/cloud audit,
# 2026-08 fix) no more hardcoded `--profile full` here either, so a
# self_hosted run's APP_TIER_SERVICES genuinely excludes vendor-backend/
# vendor-frontend (and, always, zoeconnect -- it isn't even defined
# outside the cloud override) rather than including them and simply
# never checking their health.
APP_TIER_SERVICES=()
for svc in "${ACTIVE_PROFILE_SERVICES[@]}"; do
    is_stateful=false
    for stateful in "${STATEFUL_SERVICES[@]}"; do
        if [ "$svc" = "$stateful" ]; then
            is_stateful=true
            break
        fi
    done
    if [ "$is_stateful" = false ]; then
        APP_TIER_SERVICES+=("$svc")
    fi
done

if [ "${#APP_TIER_SERVICES[@]}" -eq 0 ]; then
    log_error "No application-tier services resolved for profile(s) '${ACTIVE_PROFILES[*]}' -- refusing to proceed, this looks like a compose config problem rather than a normal deploy."
    exit 1
fi

# Readiness map consulted by every failure path from here on --
# emit_failure_diagnostics() (health-lib.sh) uses it for its "Readiness
# results" section, and it's also what the explicit verify_service_health
# loop below iterates. One definition, shared, so the diagnostic bundle
# never drifts out of sync with what this script actually checks.
#
# CRITICAL FIX (self_hosted/cloud audit, 2026-08): previously a hardcoded
# literal always including vendor-backend/vendor-frontend, with only
# zoeconnect gated behind an explicit `if DEPLOYMENT_MODE = cloud`. Now
# built the same way EXPECTED_HOST_PORTS is -- driven entirely by actual
# profile membership (is_active_service), not a DEPLOYMENT_MODE string
# check duplicated in yet another place. A self_hosted run's READINESS_MAP
# now genuinely contains only hdsp-backend/hdsp-frontend.
#
# CRITICAL FIX (release-aware health checks, 2026-08): URLs used to be a
# hardcoded SERVICE_READINESS_URL literal here -- a static map that
# silently assumed EVERY release, including releases from before a given
# service's readiness endpoint ever existed, could answer that URL. A real
# incident proved that assumption false: a legitimately old release
# (predating vendor-backend's health module entirely) can never satisfy a
# URL a later release invented, and there is no way for a fixed literal in
# this script to know which historical case it's dealing with. Every
# release now declares its OWN health endpoints in ITS OWN manifest.yml
# (written once at packaging time -- see deploy.yml's "Package Deployment
# Assets" step), so this script reads THIS release's actual values instead
# of assuming. get_service_ready_url() (manifest-lib.sh) never fails and
# returns an empty string for a release that doesn't define a given
# endpoint -- that empty string is a deliberate signal, not an error, and
# is exactly what makes an old manifest safe to read here: no exception,
# no invented URL, just "skip the HTTP layer, container-state is the whole
# check" (see verify_service_health()'s own handling of url="").
#
# MANIFEST_HEALTH_KEY maps this script's Compose service names (hyphenated,
# matching docker-compose.yml) to manifest.yml's health:/images: key
# convention (underscored, matching ci/dependencies.yml's service_key) --
# the same two-namespaces-for-one-service situation BACKEND_VERSION /
# FRONTEND_VERSION / etc. already navigate a few lines above, just made
# explicit here as a lookup table instead of five separately-named
# variables, since this loop iterates generically over all five services.
declare -A SERVICE_READINESS_LABEL=(
    [hdsp-backend]="Backend"
    [hdsp-frontend]="Frontend"
    [vendor-backend]="Vendor Backend"
    [vendor-frontend]="Vendor Portal"
    [zoeconnect]="ZoeConnect"
)
declare -A MANIFEST_HEALTH_KEY=(
    [hdsp-backend]="backend"
    [hdsp-frontend]="frontend"
    [vendor-backend]="vendor_backend"
    [vendor-frontend]="vendor_frontend"
    [zoeconnect]="zoeconnect"
)
READINESS_MAP=()
for svc in hdsp-backend hdsp-frontend vendor-backend vendor-frontend zoeconnect; do
    if is_active_service "$svc"; then
        _label="${SERVICE_READINESS_LABEL[$svc]}"
        _mkey="${MANIFEST_HEALTH_KEY[$svc]}"
        _ready_url=$(get_service_ready_url "$MANIFEST_FILE" "$_mkey")
        if [ -n "$_ready_url" ]; then
            log_info "${_label} readiness endpoint: ${_ready_url}"
        else
            log_info "${_label}: No readiness endpoint defined for this release. Using Docker health only."
        fi
        READINESS_MAP+=("${svc}|${_label}|${_ready_url}")
    fi
done
unset _label _mkey _ready_url

# 5a. Verify stateful tier is healthy BEFORE touching the application tier
# CRITICAL FIX (split-state deployment incident, 2026-08 -- see
# health-lib.sh's header comment for the full incident writeup): previously
# the ONLY thing that ever confirmed Postgres/Redis were actually healthy
# was Compose's own implicit depends_on resolution, folded invisibly into
# the app-tier `up -d` call below. If that chain is ever violated for any
# reason, nothing noticed "the database layer itself isn't healthy" as its
# own, distinct, nameable condition. This check is independent, explicit,
# and runs first -- restricted to whichever stateful services are actually
# part of the resolved profile (so a self_hosted run correctly excludes
# vendor-postgres here too).
RESOLVED_STATEFUL_SERVICES=()
for svc in "${STATEFUL_SERVICES[@]}"; do
    if is_active_service "$svc"; then
        RESOLVED_STATEFUL_SERVICES+=("$svc")
    fi
done

# CRITICAL FIX (production incident, 2026-08): verify_stateful_tier() below
# is PURELY OBSERVATIONAL -- it inspects whatever container state already
# exists via `docker compose ps -q`, it never creates or starts anything
# itself. Before this fix, the ONLY thing in this script that ever brought
# Postgres up was step 4's migration run (`docker compose --profile
# migration run --rm hdsp-migrate`), because hdsp-migrate's own
# `depends_on: hdsp-postgres` makes Compose implicitly create+start it as a
# side effect of `run`. Redis has no migration job and nothing else ahead
# of this point ever touches it -- so this check was structurally
# guaranteed to fail on hdsp-redis on EVERY deploy, regardless of host
# state, for as long as the stateful-tier pre-check has existed (confirmed
# against production's own deployments.log: dozens of consecutive failures
# all failing at this exact step, going back days -- masked for Postgres
# only because migrations happened to start it as an unrelated side
# effect). `up -d` here (deliberately NOT `--force-recreate`, matching the
# "stateful services are never force-recreated" guarantee documented at
# STATEFUL_SERVICES' definition above) creates/starts only whatever isn't
# already running; an already-healthy Postgres/Redis from a previous
# release is left completely untouched -- this only ever fills the actual
# gap (Redis, or a first-ever deploy where nothing exists yet).
if [ "${#RESOLVED_STATEFUL_SERVICES[@]}" -gt 0 ]; then
    log_info "Ensuring stateful tier is started (create/start only, never recreated): ${RESOLVED_STATEFUL_SERVICES[*]}"
    if ! docker compose "${PROFILE_FLAGS[@]}" up -d "${RESOLVED_STATEFUL_SERVICES[@]}"; then
        log_error "Failed to start stateful tier."
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
fi

if [ "${#RESOLVED_STATEFUL_SERVICES[@]}" -gt 0 ]; then
    log_info "Verifying stateful tier is healthy before starting the application tier: ${RESOLVED_STATEFUL_SERVICES[*]}"
    if ! verify_stateful_tier RESOLVED_STATEFUL_SERVICES 90; then
        log_error "Stateful tier is not healthy -- aborting before starting any application-tier container. This is exactly the check that would have caught a backend running without Postgres/Redis behind it."
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
fi

# 5b. Start the application tier
# CRITICAL FIX: previously a bare, unguarded statement relying entirely on
# `set -e` to catch a failure here -- fragile to future edits (wrapping
# this in an `if`, a pipeline, or a `&&` chain would silently defeat that),
# and gave no diagnostic beyond Compose's own exit code. Now explicit, and
# on failure dumps the full state of every service in this project before
# aborting -- turning "the deploy failed" into "specifically, THESE
# services are in THESE states" (deliverable: detect exactly which
# services never reached Running and abort immediately).
log_info "Recreating application-tier services (Postgres/Redis are never force-recreated): ${APP_TIER_SERVICES[*]}"
# --wait-timeout raised 180 -> 240 (interval-tuning follow-up, 2026-08):
# backend/vendor-backend's HEALTHCHECK now needs up to ~150s worst-case to
# converge (start_period=60s + interval=30s x retries=3), and hdsp-nginx
# doesn't even attempt its own healthcheck until both backends it depends
# on (`condition: service_healthy`) are already healthy -- 180s no longer
# has comfortable headroom for that full chain in a legitimately-slow
# (not broken) startup. 240s does.
if ! docker compose "${PROFILE_FLAGS[@]}" up -d --force-recreate --wait --wait-timeout 240 "${APP_TIER_SERVICES[@]}"; then
    log_error "docker compose up did not converge."
    emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
    exit 1
fi

# 6. Health Verification -- READINESS, not liveness.
# CRITICAL FIX: /api/v1/health/live only proves the Node process is alive;
# it says nothing about Postgres/Redis/the app's actual dependencies (see
# health-lib.sh's header comment for the incident this caused). A real
# readiness endpoint already existed in app.controller.ts
# (`/api/v1/health/ready`, checking Postgres + Redis via @nestjs/terminus)
# but nothing in the deployment pipeline ever actually consulted it --
# backend's own Dockerfile HEALTHCHECK hit /health/live too, which also
# gated every Compose `depends_on: condition: service_healthy` chain
# downstream of it. Both are now fixed (Dockerfile HEALTHCHECK + this
# check), so the fix applies at every layer that consulted a health signal,
# not just this one script. vendor-backend previously had NO readiness
# endpoint at all (a bare TCP-connect Dockerfile healthcheck) -- one was
# added (mirroring the hospital backend's pattern) specifically for this.
#
# Each check is container-state-first (verify_service_health, via
# health-lib.sh) so a container that's Exited/Dead fails immediately
# instead of burning through a curl retry loop against a port that either
# nothing, or -- as in the incident -- a FOREIGN container, is listening
# on.
# On any failure below, emit the full diagnostic bundle (container states +
# health + last-50 logs + a fresh readiness probe of every service in
# READINESS_MAP) before exiting -- see health-lib.sh's emit_failure_diagnostics()
# comment for exactly what it dumps and why.
# max_wait raised 90 -> 150 (interval-tuning follow-up, 2026-08): backend
# and vendor-backend's own Dockerfile HEALTHCHECK now uses
# start_period=60s/interval=30s/retries=3 (was 30s/15s/5) -- worst-case
# time for Docker's OWN healthcheck to converge is now larger than the old
# 90s budget here, which would otherwise make this script give up before
# Docker itself would. 150s comfortably covers that worst case.
for entry in "${READINESS_MAP[@]}"; do
    IFS='|' read -r _svc _name _url <<< "$entry"
    if ! verify_service_health "$_svc" "$_name" "$_url" 150; then
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
done
unset _svc _name _url entry
# hdsp-nginx is intentionally not re-checked here: it's already part of
# APP_TIER_SERVICES above, so the `--wait` on the up -d call already
# blocked on its own compose-level HEALTHCHECK (wget against :80) before
# this point was ever reached.

# 7. Mark Release Active
log_info "Health checks passed. Marking release active..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
log_info "Updated current symlink to ${RELEASE_DIR}"

# 8. Cleanup
perform_docker_cleanup() {
    log_info "Starting Docker cleanup..."

    log_info "Removing stopped containers..."
    docker container prune -f || log_warn "Failed to remove stopped containers."

    log_info "Removing unused images..."
    docker image prune -af || log_warn "Failed to remove unused images."

    log_info "Removing build cache..."
    docker builder prune -af || log_warn "Failed to remove build cache."

    log_info "Docker cleanup completed."
    
    log_info "Current Docker disk usage:"
    docker system df || log_warn "Failed to retrieve Docker disk usage."
}

perform_docker_cleanup
# Keep only last 5 releases, but never delete the active release
#
# CRITICAL FIX (release-immutability architecture, 2026-08): `ls -1t`
# sorts by mtime, which is exactly the field rollback.sh's own writes into
# a release directory (before this same fix removed them) could silently
# corrupt -- a real incident had a rollback-touched OLD release directory
# rank as "newest" by mtime while genuinely newer, never-rolled-back-to
# releases ranked older, which here would have meant DELETING the newer,
# valuable release directories via `rm -rf` while preserving the stale one.
# Release directory names already encode their creation time as a
# fixed-width, zero-padded prefix (`release-YYYYMMDDHHMMSS-SHORTSHA`), so a
# plain lexicographic name sort is exactly equivalent to a chronological
# sort and depends on nothing mutable. This is the same fix applied to
# deploy.yml's "Fetch previous release manifest" step, for the same reason.
CURRENT_RELEASE_NAME="$(basename "$(readlink -f "${CURRENT_LINK}")" 2>/dev/null || echo "")"
find "${RELEASES_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'release-*' -printf '%f\n' | sort -r | tail -n +6 | while read -r release; do
    if [ "$release" = "$CURRENT_RELEASE_NAME" ]; then
        log_info "Skipping active release: $release"
        continue
    fi
    log_info "Removing old release: $release"
    rm -rf "${RELEASES_DIR}/$release"
done

log_success "Deployment of ${IMAGE_TAG} completed successfully!"
