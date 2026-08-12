#!/bin/bash
set -Eeuo pipefail

# ==============================================================================
# HDSP Oracle Cloud Rollback Script
# ==============================================================================
# Same single-persistent-project architecture as deploy.sh -- exactly one
# Compose project ("hdsp") owns every container, guaranteed two independent
# ways (this script's own COMPOSE_PROJECT_NAME=hdsp export, and
# docker-compose.yml's own `name: hdsp` key). See deploy.sh's header
# comment and detect_foreign_project_containers() below for the full
# rationale and the shadow-project incident this was fixed after.

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <release-name>"
    echo "Example: $0 release-a1b2c3d"
    echo "Available releases in /opt/hdsp/releases/:"
    ls -1 /opt/hdsp/releases/
    exit 1
fi

RELEASE_NAME=$1
DEPLOY_ROOT="/opt/hdsp"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
TARGET_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
CURRENT_LINK="${DEPLOY_ROOT}/current"

echo "========================================="
echo " Starting Rollback to: ${RELEASE_NAME}   "
echo "========================================="

if [ ! -d "${TARGET_DIR}" ]; then
    echo "[ERROR] Release directory ${TARGET_DIR} does not exist!"
    exit 1
fi

# --- Deployment Lock ---
# HIGH FIX: rollback.sh previously acquired no lock at all, so a manually
# invoked rollback could race a concurrently running deploy.sh against the
# same docker compose project with no protection. Uses the SAME lock file
# as deploy.sh so the two can never run unprotected against each other.
#
# HDSP_SKIP_LOCK=1 is set by deploy.sh itself when it invokes this script
# automatically from its own failure-cleanup trap — deploy.sh still holds
# this exact lock for the duration of that call, so acquiring it again here
# would self-deadlock (a fresh `exec 9>` on the same path opens an
# independent file description in this process; flock would see the file
# as already held by the parent and fail immediately, non-blocking). Real
# mutual exclusion is already guaranteed in that case by the parent still
# holding the lock. Standalone/manual invocations (the common case this
# lock protects) always acquire it themselves below.
LOCK_FILE="${DEPLOY_ROOT}/.deploy.lock"
if [ "${HDSP_SKIP_LOCK:-}" != "1" ]; then
    echo "[INFO] Acquiring deployment lock..."
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$LOCK_PID" ] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
            echo "[WARN] Found stale lock file referencing dead PID $LOCK_PID. Re-attempting acquisition..."
            if ! flock -n 9; then
                echo "[ERROR] Lock is still held after detecting a stale PID — a live process genuinely holds it. Exiting rather than risk running unprotected."
                exit 1
            fi
        else
            echo "[ERROR] Another deployment or rollback is already in progress (PID: $LOCK_PID). Exiting."
            exit 1
        fi
    fi
    echo $$ >&9
    cleanup_lock() {
        flock -u 9 || true
        rm -f "$LOCK_FILE" || true
    }
    trap cleanup_lock EXIT
else
    echo "[INFO] Skipping lock acquisition — invoked by deploy.sh, which already holds the deployment lock for this rollback's entire duration."
fi

# --- Configuration from Manifest ---
# Pin the image tag to the release being rolled back to, not to whatever
# 'latest' currently points to. Without this, docker-compose.yml's
# ${BACKEND_VERSION:-latest} etc. fallbacks would silently redeploy the
# newest images (the ones the rollback is trying to get away from) instead
# of restoring this release's actual versions. Uses the same canonical
# release.short_sha field and manifest-lib.sh as deploy.sh -- sourced from
# THIS script's own directory (wherever this instance of rollback.sh
# lives), not from TARGET_DIR: the manifest FILE being read comes from the
# release being rolled back to, but the library code travels with whichever
# copy of this script is actually executing, same as deploy.sh.
SCRIPT_DIR_EARLY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR_EARLY}/manifest-lib.sh"
# health-lib.sh (also bundled, same directory as this script) is the shared
# stateful-tier / container-state / readiness verification logic used by
# both deploy.sh and rollback.sh -- see its own header comment for the
# split-state-deployment incident it exists to prevent from recurring.
# rollback.sh previously had NO health verification at all after its own
# `up -d` (just an echoed "please verify manually" message) -- that's the
# single biggest gap this file closes: rollback is the safety net for a
# failed deploy, and a safety net that can silently "succeed" while
# rolling back to an equally-broken state isn't one.
source "${SCRIPT_DIR_EARLY}/health-lib.sh"

MANIFEST_FILE="${TARGET_DIR}/manifest.yml"
if [ -f "${MANIFEST_FILE}" ]; then
    export IMAGE_TAG=$(extract_release_short_sha "${MANIFEST_FILE}")
    if [ -z "${IMAGE_TAG}" ]; then
        echo "[ERROR] manifest.yml found in ${TARGET_DIR} but 'short_sha:' is missing or empty. Refusing to roll back — this would silently redeploy whatever 'latest' currently points to instead of this release's actual image versions."
        exit 1
    fi
    export HDSP_VERSION="${IMAGE_TAG}"
    export SHORT_SHA="${IMAGE_TAG}"

    # CRITICAL FIX (incremental-build audit): same per-service resolution
    # as deploy.sh -- see that script's matching comment. Rolling back must
    # restore each of the 5 images to EXACTLY what this specific release's
    # manifest recorded for it, not one shared tag.
    export BACKEND_VERSION=$(extract_image_tag "${MANIFEST_FILE}" backend)
    export FRONTEND_VERSION=$(extract_image_tag "${MANIFEST_FILE}" frontend)
    export VENDOR_BACKEND_VERSION=$(extract_image_tag "${MANIFEST_FILE}" vendor_backend)
    export VENDOR_FRONTEND_VERSION=$(extract_image_tag "${MANIFEST_FILE}" vendor_frontend)
    export ZOECONNECT_VERSION=$(extract_image_tag "${MANIFEST_FILE}" zoeconnect)
    for _pair in "BACKEND_VERSION:$BACKEND_VERSION" "FRONTEND_VERSION:$FRONTEND_VERSION" "VENDOR_BACKEND_VERSION:$VENDOR_BACKEND_VERSION" "VENDOR_FRONTEND_VERSION:$VENDOR_FRONTEND_VERSION" "ZOECONNECT_VERSION:$ZOECONNECT_VERSION"; do
        _name="${_pair%%:*}"
        _value="${_pair#*:}"
        if [ -z "$_value" ]; then
            echo "[ERROR] manifest.yml found in ${TARGET_DIR} but the per-service tag for '${_name}' is missing. Refusing to roll back to avoid silently deploying 'latest'."
            exit 1
        fi
    done
    unset _pair _name _value

    echo "[INFO] Rolling back to image tag: ${IMAGE_TAG} (from ${MANIFEST_FILE})"
else
    echo "[WARN] No manifest.yml found in ${TARGET_DIR}. Falling back to VERSION file for legacy release compatibility."
    if [ -f "${TARGET_DIR}/VERSION" ]; then
        FULL_SHA=$(cat "${TARGET_DIR}/VERSION")
        export IMAGE_TAG=$(echo "${FULL_SHA}" | cut -c1-7)
        export HDSP_VERSION="${IMAGE_TAG}"
        export SHORT_SHA="${IMAGE_TAG}"
        export BACKEND_VERSION="${HDSP_VERSION}"
        export FRONTEND_VERSION="${HDSP_VERSION}"
        export VENDOR_BACKEND_VERSION="${HDSP_VERSION}"
        export VENDOR_FRONTEND_VERSION="${HDSP_VERSION}"
        export ZOECONNECT_VERSION="${HDSP_VERSION}"
        echo "[INFO] Rolling back to image tag: ${IMAGE_TAG} (from ${TARGET_DIR}/VERSION)"
    else
        echo "[ERROR] Neither manifest.yml nor VERSION found in ${TARGET_DIR}. Cannot determine this release's image versions — refusing to roll back to avoid silently deploying 'latest'."
        exit 1
    fi
fi

# Source environment configuration.
# CRITICAL FIX (release-immutability architecture, 2026-08): this used to
# ALSO `ln -sfn` a copy of this file into TARGET_DIR -- the release
# directory being rolled back to. That write is the exact root cause of a
# real production incident: it silently updated TARGET_DIR's mtime on
# every rollback, which poisoned deploy.yml's "Fetch previous release
# manifest" step (mtime-sorted release discovery) into permanently
# re-selecting the rollback target as "most recently packaged" instead of
# whatever was actually newest -- causing package-bundle to carry forward
# a stale image tag forever, across any number of genuinely newer,
# successfully-built images, for as long as deploys kept failing and
# rolling back. docker-compose.yml's `env_file:` entries are now absolute
# paths (see that file's comment), so no per-release copy or symlink is
# needed. Release directories -- including rollback TARGETS -- are never
# written to by this script; they stay read-only for their entire
# lifetime, which is what makes release-ordering discovery immune to
# rollback activity by construction, not by convention.
ENV_FILE="/opt/hdsp/.env.production"
if [ -f "${ENV_FILE}" ]; then
    set -a
    source "${ENV_FILE}"
    set +a
else
    echo "[ERROR] ${ENV_FILE} not found. Rollback cannot proceed without environment variables."
    exit 1
fi

export DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-self_hosted}"
BASE_COMPOSE="${TARGET_DIR}/docker-compose.yml"
OVERRIDE="${TARGET_DIR}/docker-compose.override.${DEPLOYMENT_MODE}.yml"

export COMPOSE_FILE="${BASE_COMPOSE}:${OVERRIDE}"
export COMPOSE_PROJECT_NAME="hdsp"

if [ ! -f "${BASE_COMPOSE}" ] || [ ! -f "${OVERRIDE}" ]; then
    echo "[ERROR] Compose files not found at ${COMPOSE_FILE}"
    exit 1
fi

# --- Active Compose profile selection (self_hosted/cloud audit, 2026-08) ---
# CRITICAL FIX: mirrors deploy.sh's identical fix -- every `docker compose`
# invocation here used to hardcode `--profile full` regardless of
# $DEPLOYMENT_MODE, so a self_hosted rollback was pulling, recreating, and
# (after the health-verification fixes) health-checking vendor-portal
# containers a self_hosted deployment never runs. See deploy.sh's matching
# comment for the full rationale -- identical logic here, so a rollback
# always mirrors whatever profile scope the deploy it's rolling back from
# used.
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
echo "[INFO] DEPLOYMENT_MODE=${DEPLOYMENT_MODE} -> active Compose profile(s): ${ACTIVE_PROFILES[*]}"

mapfile -t ACTIVE_PROFILE_SERVICES < <(docker compose "${PROFILE_FLAGS[@]}" config --services)
if [ "${#ACTIVE_PROFILE_SERVICES[@]}" -eq 0 ]; then
    echo "[ERROR] No services resolved for profile(s) '${ACTIVE_PROFILES[*]}' -- refusing to proceed, this looks like a compose config problem rather than a normal rollback."
    exit 1
fi
is_active_service() {
    local needle="$1" hay
    for hay in "${ACTIVE_PROFILE_SERVICES[@]}"; do
        [ "$needle" = "$hay" ] && return 0
    done
    return 1
}

declare -A SERVICE_HOST_PORT=(
    [hdsp-frontend]=3000
    [hdsp-backend]=3001
    [zoeconnect]=3010
    [vendor-backend]=4000
    [vendor-frontend]=4001
)
EXPECTED_HOST_PORTS=("${NGINX_HTTP_PORT:-80}" "${NGINX_HTTPS_PORT:-443}")
for _svc in hdsp-frontend hdsp-backend zoeconnect vendor-backend vendor-frontend; do
    if is_active_service "$_svc"; then
        EXPECTED_HOST_PORTS+=("${SERVICE_HOST_PORT[$_svc]}")
    fi
done
unset _svc

# --- Registry Authentication + Pull ---
# HIGH FIX: rollback.sh previously started containers directly with no
# login or pull step at all — it silently assumed the target release's
# images were already present in the local Docker image cache and that the
# CLI session was already authenticated (true only by coincidence, e.g. an
# auto-rollback running inside deploy.sh's still-open login session before
# its logout, or images not yet pruned since they were running moments
# ago). Neither is guaranteed: a standalone/manual rollback has no prior
# login, and images can be pruned (deploy.sh prunes anything unused for
# 24h+ after every successful deploy) well before an operator rolls back to
# an older release. Login and pull explicitly, mirroring deploy.sh's own
# pattern, instead of relying on ambient state.
export REGISTRY="${REGISTRY:-git.zoeconnect.in}"
export IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-hdsp}"

if [ -z "${REGISTRY_USERNAME:-}" ] || [ -z "${REGISTRY_PASSWORD:-}" ]; then
    echo "[ERROR] Registry credentials (REGISTRY_USERNAME / REGISTRY_PASSWORD) are missing."
    exit 1
fi

echo "[INFO] Authenticating to ${REGISTRY}..."
echo "${REGISTRY_PASSWORD}" | docker login "${REGISTRY}" -u "${REGISTRY_USERNAME}" --password-stdin

# --- Shadow-Compose-project guard ---
# See deploy.sh's matching function for the full rationale. Runs here too,
# not just right before `up -d` below, since pull can take long enough for
# a shadow project to matter for migrations-adjacent DNS resolution risk on
# the shared external hdsp_net network -- though rollback itself doesn't
# run migrations, the same shared-network exposure applies to any
# in-flight traffic during the pull/recreate window.
detect_foreign_project_containers() {
    # Reuses ACTIVE_PROFILE_SERVICES resolved earlier (self_hosted/cloud
    # audit, 2026-08 fix) instead of its own hardcoded `--profile full`
    # call -- see deploy.sh's matching comment.
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
            echo "[ERROR] Container(s) for service '${svc}' found under a DIFFERENT Compose project than expected ('${COMPOSE_PROJECT_NAME}'):"
            while IFS=$'\t' read -r cname cproj; do
                echo "[ERROR]     ${cname}   (project: ${cproj:-<none/manual run>})"
                # CRITICAL FIX (incident follow-up, 2026-08): mirrors
                # deploy.sh's matching block -- see that function's comment
                # for the full rationale (a real incident hit this exact
                # guard in BOTH deploy.sh and this automatic-rollback path
                # against the same foreign project, with no faster way to
                # tell whether it was safe to reconcile than a separate SSH
                # round-trip). Strictly read-only.
                local _insp=""
                if _insp=$(docker inspect "$cname" 2>/dev/null); then
                    echo "[ERROR]         image:    $(echo "$_insp" | grep -m1 '"Image":' | sed -E 's/.*"Image": *"([^"]*)".*/\1/')"
                    echo "[ERROR]         created:  $(echo "$_insp" | grep -m1 '"Created":' | sed -E 's/.*"Created": *"([^"]*)".*/\1/')"
                    echo "[ERROR]         state:    $(docker inspect -f '{{.State.Status}} (health: {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}})' "$cname" 2>/dev/null || echo "unknown")"
                    local _mounts _mline
                    _mounts=$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}} (rw={{.RW}}){{"\n"}}{{end}}' "$cname" 2>/dev/null)
                    if [ -n "$_mounts" ]; then
                        echo "[ERROR]         mounts:"
                        while IFS= read -r _mline; do
                            [ -z "$_mline" ] && continue
                            echo "[ERROR]           - ${_mline}"
                        done <<< "$_mounts"
                    else
                        echo "[ERROR]         mounts:   (none)"
                    fi
                else
                    echo "[ERROR]         (docker inspect failed for ${cname} -- it may have been removed between listing and inspection; re-run 'docker ps -a' to check current state)"
                fi
            done <<< "$matches"
        fi
    done
    if [ "$foreign_found" = true ]; then
        echo "[ERROR] Refusing to proceed: a shadow Compose project is holding container(s) that would conflict with this rollback's names/ports/network. Not attempting to remove them automatically -- one of them may be holding real data. Mount info for each foreign container is dumped above (read-only, nothing was touched) -- if every mount shown is empty or non-persistent, it is very likely safe to run 'docker compose -p <foreign-project-name> down' deliberately, by a human, to reconcile it; if any mount shows a real named volume, stop and investigate with 'docker volume inspect <name>' before doing anything further."
        return 1
    fi
    return 0
}

# --- Port-ownership guard ---
# See deploy.sh's matching function for the full rationale: catches a port
# already held by a container with no Compose labels at all (e.g. a plain
# `docker run`), which detect_foreign_project_containers() above can't see
# since it only matches on Compose service labels. EXPECTED_HOST_PORTS
# itself is built earlier, above (profile-aware -- see that block's
# comment).
detect_port_conflicts() {
    local port
    local conflict_found=false
    for port in "${EXPECTED_HOST_PORTS[@]}"; do
        [ -z "$port" ] && continue
        local matches
        matches=$(docker ps \
            --filter "publish=${port}" \
            --format '{{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.project"}}')
        [ -z "$matches" ] && continue
        while IFS=$'\t' read -r cid cname cproj; do
            [ -z "$cid" ] && continue
            if [ "${cproj:-}" != "${COMPOSE_PROJECT_NAME}" ]; then
                conflict_found=true
                echo "[ERROR] Port ${port} is already occupied by container ${cid} (${cname})."
                echo "[ERROR] Container is not part of project '${COMPOSE_PROJECT_NAME}' (project: ${cproj:-<none -- not a Compose container at all>})."
            fi
        done <<< "$matches"
    done
    if [ "$conflict_found" = true ]; then
        echo "[ERROR] Rollback aborted -- one or more required host ports are held by a container outside this project. Not attempting to stop/remove it automatically: identify what it is with 'docker inspect <id>' before deciding how to reconcile it."
        return 1
    fi
    return 0
}

if ! detect_foreign_project_containers; then
    exit 1
fi
if ! detect_port_conflicts; then
    exit 1
fi

pull_images() {
    local max_attempts=3
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        echo "[INFO] Pulling images for rollback target (Attempt $attempt/$max_attempts)..."
        if docker compose "${PROFILE_FLAGS[@]}" pull; then
            return 0
        fi
        echo "[WARN] Pull failed. Retrying in 5 seconds..."
        sleep 5
        attempt=$((attempt + 1))
    done
    return 1
}

if ! pull_images; then
    echo "[ERROR] Failed to pull images for release ${RELEASE_NAME} after retries."
    exit 1
fi

echo "[INFO] Linking ${CURRENT_LINK} -> ${TARGET_DIR}"
ln -sfn "${TARGET_DIR}" "${CURRENT_LINK}"

# --- Container-name-conflict guard + scoped force-recreate ---
# CRITICAL FIX: rollback.sh runs the exact same `docker compose ... up -d`
# logic as deploy.sh, so it was exposed to the exact same root cause --
# see deploy.sh's matching comment block for the full explanation
# (dockerd's recreate teardown isn't fully synchronous, and this is
# precisely the script most likely to run moments after a failed deploy's
# own `up -d` was still asynchronously cleaning something up). Same fix
# applied here: wait for any container still genuinely mid-removal (never
# force-removed automatically -- could be Postgres/Redis), then recreate
# only the application-tier services Compose's own resolved config lists
# for the active profile(s) this run's DEPLOYMENT_MODE selected, explicitly
# excluding the stateful ones so a rollback can never touch a database
# container as a side effect.
STATEFUL_SERVICES=(hdsp-postgres hdsp-redis vendor-postgres)

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
            echo "[ERROR] Timed out after ${max_wait}s waiting for these containers to leave a removing/dead state: $stuck"
            echo "[ERROR] Not attempting to force-remove them -- one or more may be a stateful service (Postgres/Redis) left in an unexpected state. Investigate with 'docker inspect <name>' before retrying."
            return 1
        fi
        echo "[WARN] Waiting for these containers to finish a prior removal before proceeding (${waited}s/${max_wait}s): $stuck"
        sleep "$interval"
        waited=$((waited + interval))
    done
}

# Re-check immediately before touching any containers -- pull above can
# take long enough for state to have changed since the early check.
if ! detect_foreign_project_containers; then
    exit 1
fi
if ! detect_port_conflicts; then
    exit 1
fi
if ! wait_for_clean_compose_state; then
    echo "[ERROR] Aborting rollback before touching any containers -- see the warning above."
    exit 1
fi

# Reuses ACTIVE_PROFILE_SERVICES resolved once, earlier -- see deploy.sh's
# matching comment (self_hosted/cloud audit, 2026-08 fix: no more
# hardcoded `--profile full`, so a self_hosted rollback's APP_TIER_SERVICES
# genuinely excludes vendor-backend/vendor-frontend/zoeconnect).
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
    echo "[ERROR] No application-tier services resolved for profile(s) '${ACTIVE_PROFILES[*]}' -- refusing to proceed."
    exit 1
fi

# Readiness map consulted by every failure path from here on -- see
# deploy.sh's matching comment (same rationale, same shape, so a human
# reading both scripts' diagnostic bundles sees the exact same format).
# CRITICAL FIX (self_hosted/cloud audit, 2026-08): now driven entirely by
# actual profile membership (is_active_service), not a hardcoded literal
# plus a single `DEPLOYMENT_MODE = cloud` conditional for zoeconnect only
# -- see deploy.sh's matching comment.
#
# CRITICAL FIX (release-aware health checks, 2026-08): URLs used to be a
# hardcoded SERVICE_READINESS_URL literal -- exactly the assumption that
# caused a real incident: rollback's OWN job is to restore a HISTORICAL
# release, which is precisely the case most likely to predate whatever
# endpoint a static map in this script assumes exists. Reading each
# service's URL from THIS rollback TARGET's own manifest.yml (via
# get_service_ready_url(), manifest-lib.sh) means rollback verifies health
# using exactly what that specific release actually declares about itself
# -- an old release with no health: block, or no entry for a given
# service, safely yields an empty string here (never an error, never an
# invented URL), and verify_service_health() already treats an empty url
# as "container-state only", so rollback to a pre-health-module release
# converges on container-state verification instead of hanging forever
# waiting for a URL that release can never satisfy.
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
            echo "[INFO] ${_label} readiness endpoint: ${_ready_url}"
        else
            echo "[INFO] ${_label}: No readiness endpoint defined for this release. Using Docker health only."
        fi
        READINESS_MAP+=("${svc}|${_label}|${_ready_url}")
    fi
done
unset _label _mkey _ready_url

# --- Stateful-tier verification (mirrors deploy.sh) --------------------
# CRITICAL FIX (split-state deployment incident, 2026-08 -- see
# health-lib.sh's header comment): explicitly, independently confirms
# Postgres/Redis are healthy BEFORE the application tier is touched,
# rather than trusting Compose's implicit depends_on resolution alone.
RESOLVED_STATEFUL_SERVICES=()
for svc in "${STATEFUL_SERVICES[@]}"; do
    if is_active_service "$svc"; then
        RESOLVED_STATEFUL_SERVICES+=("$svc")
    fi
done

# CRITICAL FIX (production incident, 2026-08 -- see deploy.sh's matching
# comment for the full root-cause writeup): verify_stateful_tier() below is
# purely observational, it never starts anything. deploy.sh at least got
# Postgres started as a side effect of its migration step; this script has
# NO migration step at all, so before this fix, Postgres/Redis only ever
# came up here by pure chance -- whatever a PRIOR deploy happened to leave
# running. A rollback invoked when nothing (or only a partial stateful
# tier) is currently up had no path to ever bring it up itself. `up -d`
# here (never `--force-recreate`) creates/starts only what's missing,
# leaving an already-healthy stateful service from the current release
# completely untouched.
if [ "${#RESOLVED_STATEFUL_SERVICES[@]}" -gt 0 ]; then
    echo "[INFO] Ensuring stateful tier is started (create/start only, never recreated): ${RESOLVED_STATEFUL_SERVICES[*]}"
    if ! docker compose "${PROFILE_FLAGS[@]}" up -d "${RESOLVED_STATEFUL_SERVICES[@]}"; then
        echo "[ERROR] Failed to start stateful tier."
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
fi

if [ "${#RESOLVED_STATEFUL_SERVICES[@]}" -gt 0 ]; then
    echo "[INFO] Verifying stateful tier is healthy before starting the application tier: ${RESOLVED_STATEFUL_SERVICES[*]}"
    if ! verify_stateful_tier RESOLVED_STATEFUL_SERVICES 90; then
        echo "[ERROR] Stateful tier is not healthy -- aborting rollback before starting any application-tier container."
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
fi

echo "[INFO] Starting containers from rolled-back compose file (${COMPOSE_FILE})..."
echo "[INFO] Recreating application-tier services (Postgres/Redis are never force-recreated): ${APP_TIER_SERVICES[*]}"
# CRITICAL FIX: previously a bare, unguarded statement relying entirely on
# `set -e`. Now explicit, with a full diagnostic bundle on failure -- see
# deploy.sh's matching comment for the full reasoning. --wait-timeout
# raised 180 -> 240 -- see deploy.sh's matching comment (backend/
# vendor-backend Dockerfile HEALTHCHECK timing changed).
if ! docker compose "${PROFILE_FLAGS[@]}" up -d --force-recreate --wait --wait-timeout 240 "${APP_TIER_SERVICES[@]}"; then
    echo "[ERROR] docker compose up did not converge."
    emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
    exit 1
fi

# --- Health verification (mirrors deploy.sh) ----------------------------
# CRITICAL FIX: rollback.sh previously did NOT verify health at all after
# recreating containers -- it just printed "please verify health manually"
# and exited 0. That means an automatic rollback (triggered from deploy.sh's
# own cleanup() trap, i.e. already in a failure scenario) could report
# "succeeded" while the rolled-back release was ALSO not actually serving
# traffic correctly -- the exact same blind spot the original deploy had,
# on the one script whose entire job is to be the safety net for that.
# Uses READINESS endpoints (not liveness) for the same reason deploy.sh
# does -- see health-lib.sh's header comment. On any failure, the same
# full diagnostic bundle deploy.sh emits is emitted here too.
# max_wait raised 90 -> 150 -- see deploy.sh's matching comment (backend/
# vendor-backend Dockerfile HEALTHCHECK timing changed).
for entry in "${READINESS_MAP[@]}"; do
    IFS='|' read -r _svc _name _url <<< "$entry"
    if ! verify_service_health "$_svc" "$_name" "$_url" 150; then
        emit_failure_diagnostics READINESS_MAP ACTIVE_PROFILE_SERVICES
        exit 1
    fi
done
unset _svc _name _url entry

echo "[INFO] Ensuring registry logout..."
docker logout "${REGISTRY}" || true

echo "[SUCCESS] Rollback completed successfully -- health verified (container state + readiness), not just assumed."
