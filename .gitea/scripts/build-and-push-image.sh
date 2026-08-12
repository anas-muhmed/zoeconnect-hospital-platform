#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build and Push Image — relocated from .gitea/workflows/deploy.yml's
# "Build and Push Image" step (build-images job), 2026-08.
#
# WHY THIS SCRIPT EXISTS (act_runner interpolation hotfix, 2026-08):
# This step's `run:` block was ~900 lines containing many `${{ }}`
# expressions (in comments, strings, shell code, heredocs). act_runner's
# `Interpolate()` (pkg/runner/expression.go) calls `rewriteSubExpression()`
# on the ENTIRE run-block string as one unit, collapsing every `${{ }}` in
# it into ONE giant `format('...{0}...{1}...', expr0, expr1, ...)` call,
# which is then re-parsed character-by-character by exprparser.format()'s
# hand-rolled brace-matching state machine (pkg/exprparser/functions.go).
# PROVEN IN PRODUCTION: this pipeline died with "Unable to interpolate
# expression format(...)" before bash ever started — the shell was never
# launched. Root-cause traced to this exact code path (confirmed against
# nektos/act's actual source, which act_runner vendors) — see this
# workflow's own incident history for the full trace.
#
# THE FIX: every `${{ }}` this script used to contain has been replaced by
# a plain shell variable ($SERVICE_KEY, $REGISTRY, etc.), each one now
# supplied via this step's own small `env:` block in deploy.yml — a
# handful of small, independent expressions, never concatenated into one
# giant format() call. The workflow step's `run:` is now just two lines
# (chmod + invoke) containing NO `${{ }}` at all, so `Interpolate()`
# short-circuits immediately (`if !strings.Contains(in, "${{") { return
# in }`) and never enters rewriteSubExpression()/format() for this step's
# body at all.
#
# This is a RELOCATION, not a rewrite: every comment, every line of logic,
# every safeguard below is unchanged from the original workflow step.
# Only the mechanism for getting dynamic values into the shell changed
# (env vars instead of inline `${{ }}` substitution).
#
# CALLING CONTEXTS (2026-08, updated after the matrix-strategy removal
# below): this script runs identically from two different callers, and
# derives EVERYTHING it needs from SERVICE_KEY alone plus the lookup table
# below -- neither caller duplicates any build logic, they just invoke this
# script once per service, in a plain bash loop:
#   1. build-images job (deploy.yml) -- "Build and Push Images" step loops
#      over `jq -r '.[]'` on detect-changes' build_matrix JSON array,
#      calling `SERVICE_KEY="$svc" .gitea/scripts/build-and-push-image.sh`
#      once per entry.
#   2. registry-repair's repair loop (.gitea/scripts/registry-repair.sh) --
#      same pattern, one call per service whose carried-forward registry
#      tag is missing.
# Both callers now use the EXACT SAME invocation shape (`SERVICE_KEY="$svc"
# .gitea/scripts/build-and-push-image.sh`, a plain bash for-loop, no
# `strategy.matrix` involved anywhere) -- there is no longer a meaningful
# difference between the two calling contexts at all.
#
# CRITICAL FIX (act_runner matrix-strategy abandoned entirely, 2026-08):
# `strategy.matrix.service_key: ${{ fromJson(needs.detect-changes.outputs.
# build_matrix) }}` was PROVEN IN PRODUCTION to never populate
# `matrix.service_key` on this act_runner version, even for the simplest
# possible shape (a flat array of bare strings) -- real diagnostics from a
# live run showed `BUILD_MATRIX_RAW=["vendor_backend"]` (needs-output
# propagation confirmed correct) alongside `SERVICE_KEY=""` and
# `MATRIX_JSON={}` in the SAME job instance, isolating the fault
# conclusively to `strategy.matrix`'s own `fromJson()` evaluation --
# independent of both detect-changes.sh (already independently proven
# correct) and of the specific JSON shape (already simplified once, still
# broken). Rather than continue working around this act_runner
# incompatibility from inside `strategy.matrix`, `build-images` no longer
# uses a matrix at all -- see that job's own comment in deploy.yml. This
# script's job is now simpler as a direct result: SERVICE_KEY always
# arrives as a concrete, real value from an explicit shell loop variable,
# never from matrix expansion, so the "phantom empty matrix job" guard and
# the MATRIX_JSON diagnostic dump this script used to carry (both existed
# solely to explain and safely degrade an EMPTY matrix.service_key) no
# longer apply to either caller and have been removed. An empty or
# unrecognized SERVICE_KEY is now always a real bug in the calling loop,
# not an expected act_runner quirk -- see the lookup table's own default
# case below, which fails loudly for both.
#
# SERVICE_KEY is the sole canonical, required input; all other metadata
# (image name / Dockerfile / build context / type) is derived exclusively
# from the static lookup table below, for both callers identically.
#
# Expected environment (set via each caller's own `env:` block, or already
# present as Gitea/GitHub Actions default runner env vars — see the
# GITHUB_SHA/GITHUB_REPOSITORY/GITHUB_SERVER_URL note below):
#   SERVICE_KEY              REQUIRED. The one canonical input this whole
#                              script derives everything else from (image
#                              name / Dockerfile / build context / type,
#                              via the lookup table below). Both callers
#                              set it to one concrete, real service key per
#                              invocation -- never empty, never sourced from
#                              a `strategy.matrix` context (there is no
#                              longer one anywhere in this pipeline).
#   REGISTRY, IMAGE_NAMESPACE, CACHE_BACKEND, ENABLE_SBOM, ENABLE_PROVENANCE
#                              REQUIRED. Already workflow-level env vars;
#                              re-declared explicitly on each caller's step
#                              for auditability.
#   GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_WORKSPACE
#                              NOT set via either caller's `env:` block —
#                              GITHUB_-prefixed names are reserved by the
#                              Actions runner and cannot be overridden via
#                              a workflow's `env:` (GitHub Actions docs;
#                              act_runner replicates this for
#                              compatibility). They are already injected
#                              automatically into every step's shell
#                              environment with these exact values — this
#                              script reads them directly, which is exactly
#                              equivalent to the original `${{ github.sha }}`
#                              / `${{ github.repository }}` /
#                              `${{ github.server_url }}` expressions, and
#                              is in fact how line 614's original
#                              `${GITHUB_WORKSPACE:-$(pwd)}` already worked
#                              before this relocation.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SHORT_SHA=$(git rev-parse --short HEAD)
BASE="${REGISTRY}/${IMAGE_NAMESPACE}"

SEMVER=""
if git describe --tags --exact-match > /dev/null 2>&1; then
  SEMVER=$(git describe --tags --exact-match)
fi

# ── Matrix field validation (regression guard, 2026-08) ─────────
# ORIGINAL INCIDENT: a run against this matrix produced the tag
# "git.zoeconnect.in/camerin_innovate/:c107592" -- an empty
# repository-name segment, rejected by Docker as "invalid
# reference format" with no indication of which variable was
# missing. Root-cause trace performed end-to-end at the time
# pinned it to the matrix losing its data between
# detect-changes.sh's output and this job's `strategy.matrix`.
#
# FOLLOW-UP INCIDENT (act_runner matrix-evaluation
# incompatibility, 2026-08): a later, more targeted trace (full
# diagnostic dump comparing the raw needs-output string against
# `toJson(matrix)` inside this job) proved definitively WHERE:
# the needs-output string itself was always correct, valid JSON
# -- confirmed by echoing it via plain step-level `${{ }}`
# substitution -- but `fromJson()` used specifically inside
# `strategy.matrix.include` (a DIFFERENT evaluation phase,
# resolved at job-scheduling time before this job's steps ever
# run) still produced `{}` for an object-array value. That
# isolated the fault to act_runner's matrix-strategy resolver,
# not to detect-changes.sh (independently proven correct) and
# not to field-name mismatches (also independently ruled out).
# Fixed by changing the matrix to a flat array of bare
# service_key strings (the simplest possible JSON shape crossing
# that specific boundary) and moving the static per-service
# metadata into the SERVICE_KEY lookup immediately below --
# see this job's `strategy:` block for the full comment.
#
# This validation block's own job hasn't changed: every
# matrix-sourced value is still bound to a real shell variable
# and asserted non-empty before it's used for anything,
# including the cache-dir naming below.
#
# CRITICAL FIX (act_runner matrix-strategy abandoned entirely, 2026-08):
# this lookup supplies ALL per-service metadata (image name / Dockerfile /
# build context / type) for every SERVICE_KEY this script is ever called
# with -- both callers now pass SERVICE_KEY as a plain shell loop variable
# from `jq -r '.[]'` over a JSON array of bare strings, never through
# `strategy.matrix`. This table changes only when a new service is added
# to detect-changes.sh/ci/dependencies.yml -- see detect-changes.sh's own
# "Adding a new service" header comment, which already documents this
# exact metadata as static, not path-dependency data.
#
# SERVICE_KEY is REQUIRED and must be non-empty and present in this table --
# unlike the old matrix-strategy caller, neither current caller can ever
# legitimately invoke this script with an empty SERVICE_KEY (a `for svc in
# $(jq -r '.[]' <<<"$BUILD_MATRIX_RAW")` loop simply never iterates when the
# array is empty, so the loop body -- and this script -- never runs at all
# for a no-op invocation; there is no equivalent of act_runner's old
# "phantom job for an empty matrix" quirk left to guard against). An empty
# or unrecognized SERVICE_KEY here is therefore always a real bug in the
# calling loop (e.g. build_matrix contained something unexpected), not an
# expected runtime state -- fail loudly rather than degrade.
SERVICE_KEY="${SERVICE_KEY:?SERVICE_KEY is required and was not set -- both build-images' and registry-repair's calling loops must set it to one concrete service key per invocation.}"
case "$SERVICE_KEY" in
  backend)
    IMAGE_NAME="hdsp-backend"; IMAGE_FILE="docker/backend.Dockerfile"; IMAGE_CONTEXT="."; IMAGE_TYPE="backend" ;;
  frontend)
    IMAGE_NAME="hdsp-frontend"; IMAGE_FILE="docker/frontend.Dockerfile"; IMAGE_CONTEXT="."; IMAGE_TYPE="frontend" ;;
  vendor_backend)
    IMAGE_NAME="hdsp-vendor-backend"; IMAGE_FILE="docker/vendor-backend.Dockerfile"; IMAGE_CONTEXT="."; IMAGE_TYPE="backend" ;;
  vendor_frontend)
    IMAGE_NAME="hdsp-vendor-frontend"; IMAGE_FILE="docker/vendor-frontend.Dockerfile"; IMAGE_CONTEXT="."; IMAGE_TYPE="frontend" ;;
  zoeconnect)
    IMAGE_NAME="hdsp-zoeconnect"; IMAGE_FILE="docker/zoeconnect.Dockerfile"; IMAGE_CONTEXT="./zoeconnect"; IMAGE_TYPE="frontend" ;;
  *)
    echo "❌ CRITICAL: SERVICE_KEY ('${SERVICE_KEY}') does not match any entry in this lookup table. This means detect-changes.sh's MATRIX_ENTRIES and this script's SERVICE_KEY case statement have drifted apart -- if a new service was added to detect-changes.sh/ci/dependencies.yml, add a matching case here." >&2
    exit 1
    ;;
esac

: "${IMAGE_NAME:?IMAGE_NAME is empty for service_key='${SERVICE_KEY}' -- lookup table entry is malformed.}"
: "${IMAGE_FILE:?IMAGE_FILE is empty for service_key='${SERVICE_KEY}' -- lookup table entry is malformed.}"
: "${IMAGE_CONTEXT:?IMAGE_CONTEXT is empty for service_key='${SERVICE_KEY}' -- lookup table entry is malformed.}"
: "${IMAGE_TYPE:?IMAGE_TYPE is empty for service_key='${SERVICE_KEY}' -- lookup table entry is malformed.}"
: "${SHORT_SHA:?SHORT_SHA is empty}"
: "${BASE:?BASE is empty -- REGISTRY/IMAGE_NAMESPACE env vars did not resolve}"

echo "BASE=$BASE"
echo "IMAGE_NAME=$IMAGE_NAME"
echo "IMAGE_FILE=$IMAGE_FILE"
echo "IMAGE_CONTEXT=$IMAGE_CONTEXT"
echo "IMAGE_TYPE=$IMAGE_TYPE"
echo "SHORT_SHA=$SHORT_SHA"
echo "TAG_NAME=${BASE}/${IMAGE_NAME}:${SHORT_SHA}"

# ── Per-matrix-job local export-cache paths ─────────────────────
# CRITICAL FIX: previously these were the literal, unnamespaced
# paths /tmp/.buildx-cache and /tmp/.buildx-cache-new, identical
# across all 5 matrix images. With `max-parallel: 2`, two matrix
# jobs build concurrently on this shared self-hosted runner, and
# both would write their `--cache-to=type=local,mode=max` export
# to the SAME directory at the same time — interleaving/
# corrupting each other's cache blobs, and then racing each
# other's `cleanup()` rotation (rm old, mv new→current) below.
# Namespacing by IMAGE_NAME (resolved from matrix.service_key via
# the lookup table above) gives each image its own cache
# directory, so two concurrent builds never touch the same path.
# This costs nothing in cache effectiveness: builds were already
# only ever reading their OWN image's cache-relevant layers back
# (a different Dockerfile's cached layers were never usefully
# shared anyway), so per-image isolation loses no real hit rate
# while fully eliminating the collision.
CACHE_DIR="/tmp/.buildx-cache-${IMAGE_NAME}"
CACHE_DIR_NEW="/tmp/.buildx-cache-new-${IMAGE_NAME}"

# ROOT-CAUSE FIX (CI panic investigation, 2026-08): defined here, BEFORE
# `trap cleanup EXIT` is registered below, not down at the build invocation
# where it used to live. cleanup() (see its own comment) now takes an
# exclusive lock on this same file before rotating the export-cache -- it
# needs $BUILDER_LOCKFILE to be a real, already-set path on EVERY exit path
# this script can take, including the disk-space guard's early `exit 1`
# further down, which runs long before the build invocation. Same lock
# file setup-buildx-builder.sh takes an EXCLUSIVE lock on for builder
# recreate, and the build invocation below takes a SHARED lock on for its
# own duration -- reusing it here (not a second, separate lock file) is
# what lets an exclusive acquisition here correctly wait for a same-image
# build that's still shutting down, using a kernel-enforced guarantee
# rather than a second, independent, easier-to-drift lock.
BUILDER_LOCKFILE="/tmp/gitea-buildx-builder.lock"

# ── Cleanup via trap EXIT: fires on every exit path (normal end,
# `exit 1` on push failure, or anything unexpected) — not just the
# two paths a manual if/else happened to cover. A real run showed
# cleanup placed after a manual success check simply never ran on
# any failed push, letting cache/images accumulate unboundedly
# across runs until the disk filled. A trap can't be skipped by
# forgetting to place a call on some new exit path added later.
# CRITICAL FIX: tracks exactly which image tags THIS job created
# (populated as the build/tag steps below run), so cleanup() can
# remove precisely those instead of every unused image on the
# host. See cleanup()'s comment for why this matters.
IMAGE_TAGS_CREATED=()

cleanup() {
  local exit_code=$?
  echo "===== CLEANUP (trap EXIT, script exit code=$exit_code) ====="
  echo "[DIAG] CLEANUP TRAP FIRED  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
  # CI PANIC INVESTIGATION (2026-08) -- STATUS: hypothesis, not yet
  # confirmed from a live run. A reported failure showed Buildx panicking
  # ("send on closed channel", inside Buildx's own progress printer) right
  # after "could not lock .../index.json.lock: ... no such file or
  # directory", on a run whose logs also showed the build step as CANCELED
  # (this workflow's `concurrency: { cancel-in-progress: true }` cancels
  # an in-flight run when a newer push arrives). Two explanations are both
  # consistent with that log and are NOT yet distinguished by evidence:
  #   (a) this trap's OLD, unguarded `rm -rf "$CACHE_DIR"` raced a still-
  #       unwinding `docker buildx build` process that still had
  #       index.json.lock open (cleanup-races-buildx), vs.
  #   (b) the cancellation alone triggered Buildx's own shutdown-ordering
  #       panic, and the missing-lock warning is an independent, unrelated
  #       symptom of BuildKit aborting mid cache-initialization (buildx-
  #       cancel-only, cleanup never in the picture).
  # The `[DIAG]` timestamps below (here, at build start/exit, and around
  # the rotation itself) exist specifically to answer this from a live
  # run: if a future failure shows a `[DIAG] CACHE-ROTATE` line between
  # `[DIAG] BUILD START` and `[DIAG] BUILD EXIT` for the SAME image, (a) is
  # confirmed; if `[DIAG] BUILD EXIT` always precedes cleanup, (a) is ruled
  # out and the panic is purely a Buildx cancellation bug. Do not treat (a)
  # as proven until that evidence exists.
  #
  # Independent of which explanation is correct, this block is still
  # hardened, because the OLD implementation had two real defects on its
  # own merits regardless of what caused any particular incident:
  #  1. Transactional rotation: the old code did `rm -rf "$CACHE_DIR"` THEN
  #     `mv "$CACHE_DIR_NEW" "$CACHE_DIR"` -- if anything interrupted that
  #     window (this script being killed, a full disk, etc.), the OLD,
  #     perfectly good cache was already gone with nothing to replace it.
  #     Below, the existing cache is renamed to "$CACHE_DIR.old" (a single
  #     atomic rename(), not a multi-second recursive delete) and only
  #     removed for real after the new cache has successfully taken its
  #     place -- and restored from .old if that mv ever fails. There is no
  #     longer any window where $CACHE_DIR can end up simply absent.
  #  2. Exclusive lock on the SAME $BUILDER_LOCKFILE the build itself holds
  #     a SHARED lock on for its entire duration (see the `docker buildx
  #     build` invocation below). If hypothesis (a) above is ever confirmed,
  #     this closes it completely: flock's guarantee is enforced by the
  #     kernel, not by bash's own signal-handling behavior, so as long as
  #     the build subshell's file descriptor on this lockfile is still
  #     open -- for ANY reason, including still unwinding from a
  #     cancellation signal -- this trap's attempt to acquire the
  #     exclusive lock blocks until that fd is truly closed. Bounded to
  #     30s so a genuinely stuck build can't hang cleanup forever;
  #     degrades to a loud warning (never a hard failure -- cleanup must
  #     never break the job) if that timeout is hit.
  if [[ "${CACHE_BACKEND:-}" == "local" ]]; then
    echo "[DIAG] CACHE-ROTATE START ($CACHE_DIR)  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
    (
      if flock -x -w 30 200; then
        echo "[DIAG] CACHE-ROTATE LOCK ACQUIRED  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
        if [ -d "$CACHE_DIR_NEW" ]; then
          rm -rf "${CACHE_DIR}.old"
          mv "$CACHE_DIR" "${CACHE_DIR}.old" 2>/dev/null || true
          if mv "$CACHE_DIR_NEW" "$CACHE_DIR"; then
            echo "✅ Export-cache rotated ($CACHE_DIR_NEW -> $CACHE_DIR)."
            rm -rf "${CACHE_DIR}.old"
          else
            echo "⚠️  WARNING: mv of $CACHE_DIR_NEW -> $CACHE_DIR failed unexpectedly -- restoring previous cache from ${CACHE_DIR}.old so this run's failure doesn't leave the cache directory missing."
            mv "${CACHE_DIR}.old" "$CACHE_DIR" 2>/dev/null || echo "⚠️  WARNING: restore from ${CACHE_DIR}.old also failed -- cache will be cold next run, but this is not fatal (cleanup must never break the job)."
          fi
        else
          echo "(no new export-cache to rotate -- leaving existing $CACHE_DIR untouched)"
        fi
      else
        echo "⚠️  WARNING: could not acquire exclusive builder lock within 30s to rotate the export-cache -- a build may still be shutting down. Skipping rotation this run (existing cache, if any, is left untouched and safe); next run will retry."
      fi
    ) 200>"$BUILDER_LOCKFILE"
    echo "[DIAG] CACHE-ROTATE END  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
  fi
  echo "-- docker system df before cleanup --"
  docker system df 2>&1 || true
  FREE_BEFORE_CLEANUP=$(df -m / | awk 'NR==2 {print $4}')
  # Scoped to this one named builder only — never a bare
  # `docker system prune` here, that would also nuke unrelated
  # images/containers/cache belonging to other jobs/builders that
  # might be sharing this runner.
  # HIGH FIX: `--keep-storage` is deprecated by buildx in favor of
  # `--max-used-space` (same ceiling semantics: prune LRU cache
  # entries until usage <= this value). `|| echo ...` instead of
  # `|| true` so a broken/unsupported flag is visible in logs
  # instead of silently no-op-ing forever.
  docker buildx prune --builder gitea-persistent-builder -f --max-used-space 6GB \
    || echo "⚠️  WARNING: scoped buildx cache prune failed or is unsupported by this buildx version — cache may grow unchecked. Check 'docker buildx prune --help' on this runner."
  # CRITICAL FIX: previously `docker image prune -af`, which
  # removes EVERY unused image on the host regardless of owner.
  # Under the `--load` architecture (this workflow builds with
  # `--load`, not native `--push`), every matrix job's image is
  # loaded into this SAME shared Docker daemon image store and
  # sits there — tagged, but not yet pushed — for the duration
  # of the smoke test and push. With `max-parallel: 2`, a fast
  # sibling job's `-af` prune could delete a slower sibling's
  # in-flight image out from under it. Removing only the exact
  # tags THIS job created can never affect another job's image,
  # regardless of how many run concurrently.
  if [ "${#IMAGE_TAGS_CREATED[@]}" -gt 0 ]; then
    echo "Removing images created by this job: ${IMAGE_TAGS_CREATED[*]}"
    docker rmi -f "${IMAGE_TAGS_CREATED[@]}" >/dev/null 2>&1 || echo "(one or more already gone, or still referenced elsewhere — fine)"
  else
    echo "No images were created by this job before exit — nothing job-scoped to remove."
  fi
  docker container prune -f || true
  docker volume prune -f || true
  echo "-- docker system df after cleanup --"
  docker system df 2>&1 || true
  df -h / || true
  # HIGH FIX: emit a warning (not a failure — cleanup must never
  # break the job) if this cleanup pass didn't actually recover
  # any disk space, so a silently-broken prune (e.g. a future
  # buildx version changing flag behavior again) shows up in logs
  # immediately instead of resurfacing months later as another
  # disk-exhaustion incident with no trail pointing at the cause.
  FREE_AFTER_CLEANUP=$(df -m / | awk 'NR==2 {print $4}')
  if [ "$FREE_AFTER_CLEANUP" -le "$FREE_BEFORE_CLEANUP" ]; then
    echo "⚠️  WARNING: cleanup did not increase free disk space (before: ${FREE_BEFORE_CLEANUP}MB, after: ${FREE_AFTER_CLEANUP}MB). If this persists across runs, cache/image growth is not actually being reclaimed — investigate before disk fills."
  else
    echo "✅ Cleanup reclaimed $((FREE_AFTER_CLEANUP - FREE_BEFORE_CLEANUP))MB of free disk space."
  fi
  return $exit_code
}
trap cleanup EXIT

# NOTE: a "lightweight pre-build prune" used to run here
# (`docker buildx prune --max-used-space 6GB`), redundant with the
# EXIT-trap cleanup() above, which already runs unconditionally
# after every job (including failed ones) and enforces the same
# ceiling. Removed as a pure duplicate-work trim; cleanup()'s
# cache-rotation, thresholds, and post-build behavior are
# unchanged. The disk-space guard below (and its rescue prune) is
# unrelated and still runs exactly as before.
echo "Disk usage before building ${IMAGE_NAME}:"
df -h /
FREE_SPACE=$(df -m / | awk 'NR==2 {print $4}')
if [ "$FREE_SPACE" -lt 2048 ]; then
  echo "⚠️  Disk space critically low ($FREE_SPACE MB) before build."
  echo "Last-chance rescue: targeted cleanup only — never a blanket 'docker system prune', which would remove other jobs' in-use images/containers/volumes too..."
  docker buildx prune --builder gitea-persistent-builder -af --max-used-space 2GB \
    || echo "⚠️  WARNING: rescue buildx cache prune failed or is unsupported by this buildx version."
  # CRITICAL FIX: previously `docker system prune -af --volumes`,
  # an unscoped sweep of every unused container/network/image/
  # volume on the host — including a concurrently running sibling
  # matrix job's loaded-but-unpushed image. Replaced with:
  #   - `docker image prune -f` (no `-a`): only removes DANGLING
  #     (untagged) images. A sibling job's image is always tagged
  #     while it's in use, so it can never match this by
  #     definition — safe under concurrency.
  #   - `docker container prune -f` / `docker volume prune -f`:
  #     both only ever touch resources with zero references from
  #     any container (running or stopped) — something another
  #     job is actively using can never be a target of either.
  docker image prune -f || true
  docker container prune -f || true
  docker volume prune -f || true
  df -h /
  FREE_SPACE=$(df -m / | awk 'NR==2 {print $4}')
  if [ "$FREE_SPACE" -lt 2048 ]; then
    echo "ERROR: Disk space still critically low ($FREE_SPACE MB) after rescue prune. Aborting — this needs runner-level attention (disk too small for this workload, or something outside Docker's own storage is consuming space)."
    exit 1
  fi
  echo "✅ Rescue prune recovered enough space to continue ($FREE_SPACE MB free)."
fi

# Immutable Tag Logic
TAG_NAME="${BASE}/${IMAGE_NAME}:${SHORT_SHA}"
BUILD_ARGS="--progress=plain"

if [[ "${IMAGE_NAME}" == "hdsp-zoeconnect" ]]; then
  # CRITICAL FIX (infra vs. app-change classification audit,
  # 2026-08): this value used to be a literal hardcoded right
  # here. That's wrong: this workflow file is classified as
  # `infra` in ci/dependencies.yml, and an infra-only change
  # never triggers a rebuild (by design -- see that file's own
  # header comment) -- but Next.js inlines NEXT_PUBLIC_* vars
  # into the client bundle at build time (see
  # docker/zoeconnect.Dockerfile's ARG/ENV placement, before
  # `npm run build`), so this value genuinely IS image content,
  # not deployment config. A literal here meant editing it would
  # silently never take effect until some unrelated zoeconnect
  # source change happened to trigger a rebuild anyway. Reading
  # it from zoeconnect/build-args.env instead means editing the
  # value is a change UNDER zoeconnect/**, which
  # ci/dependencies.yml's existing zoeconnect path rule already
  # covers -- detect-changes.sh correctly marks zoeconnect
  # changed, with zero new rule classes needed.
  ZOECONNECT_BUILD_ARGS_FILE="${GITHUB_WORKSPACE:-$(pwd)}/zoeconnect/build-args.env"
  if [ -f "$ZOECONNECT_BUILD_ARGS_FILE" ]; then
    set -a
    source "$ZOECONNECT_BUILD_ARGS_FILE"
    set +a
  fi
  : "${NEXT_PUBLIC_APP_URL:?zoeconnect/build-args.env must define NEXT_PUBLIC_APP_URL}"
  BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}"
fi

# CRITICAL FIX (production incident, 2026-08 -- layer 1 of 3, see docker/
# frontend.Dockerfile's and docker/vendor-frontend.Dockerfile's matching
# comments for the other two): NEXT_PUBLIC_API_URL was never explicitly
# passed as a `--build-arg` for either frontend image -- both Dockerfiles'
# `ARG NEXT_PUBLIC_API_URL` (no default) therefore resolved to an EMPTY
# STRING (Docker's own documented behavior for an unsupplied, default-less
# ARG), which Next.js's build-time inlining then baked into the client
# bundle as a defined, non-nullish `""`, silently bypassing the `??`
# fallback in both apps' axios clients and dropping the API path prefix
# from every request in production.
#
# This is deliberately made EXPLICIT here, in CI, as the PRIMARY fix --
# not left solely to a Dockerfile default -- so that a future accidental
# removal of this block is a build-time misconfiguration CI is capable of
# surfacing (e.g. via a future "assert this build-arg was passed" check),
# rather than a silently-still-working build masking the mistake
# indefinitely. The Dockerfile ARG/ENV default (`${NEXT_PUBLIC_API_URL:-
# ...}`) is a SECOND, independent layer -- the image still builds
# correctly even if this block is ever accidentally deleted -- and the
# frontend code's `||` fallback (see client.ts in both apps) is a THIRD.
# All three intentionally encode the exact same value; that redundancy is
# the point, not a mistake to "clean up" later.
#
# Both values are constant, RELATIVE paths -- never an absolute domain --
# because docker/nginx/conf.d/cloud.conf and docker/nginx/conf.d/
# self-hosted.conf both reverse-proxy `/api/` to their respective backend
# under the exact same hostname the frontend itself is served from
# (confirmed byte-for-byte identical `location /api/` blocks in both
# configs for both the hospital and vendor domains). A relative value is
# therefore correct, unmodified, for cloud, self-hosted, staging, or any
# future environment this single shared image is deployed to -- no
# per-environment branching needed here, unlike zoeconnect's
# NEXT_PUBLIC_APP_URL above (a genuinely different value per environment,
# hence that separate build-args.env mechanism).
if [[ "${IMAGE_NAME}" == "hdsp-frontend" ]]; then
  BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_API_URL=/api/v1"
elif [[ "${IMAGE_NAME}" == "hdsp-vendor-frontend" ]]; then
  BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_API_URL=/api"
fi

# Configurable Cache Backend
if [[ "$CACHE_BACKEND" == "gha" ]]; then
  CACHE_ARGS="--cache-from=type=gha --cache-to=type=gha,mode=max"
elif [[ "$CACHE_BACKEND" == "local" ]]; then
  CACHE_ARGS="--cache-from=type=local,src=$CACHE_DIR --cache-to=type=local,dest=$CACHE_DIR_NEW,mode=max"
else
  CACHE_ARGS=""
fi

# Configurable Attestations
ATTEST_ARGS=""
if [[ "$ENABLE_SBOM" == "false" ]]; then
  ATTEST_ARGS="$ATTEST_ARGS --sbom=false"
fi
if [[ "$ENABLE_PROVENANCE" == "false" ]]; then
  ATTEST_ARGS="$ATTEST_ARGS --provenance=false"
fi

# OCI Labels
# NOTE (act_runner interpolation hotfix, 2026-08): GITHUB_SERVER_URL,
# GITHUB_REPOSITORY, and GITHUB_SHA below are the runner's own
# auto-injected default env vars (identical values to the original
# `${{ github.server_url }}` / `${{ github.repository }}` /
# `${{ github.sha }}` expressions) -- NOT passed via this step's `env:`
# block, since GITHUB_-prefixed names are reserved and cannot be
# overridden there. See this script's header comment for the full
# explanation.
LABEL_ARGS="--label org.opencontainers.image.source=${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY} \
            --label org.opencontainers.image.revision=${GITHUB_SHA} \
            --label org.opencontainers.image.created=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
            --label org.opencontainers.image.version=$SHORT_SHA"

# ── Build-failure root-cause diagnostics (2026-08) ──────────────────────
# A real run's own [DIAG] instrumentation (added for the earlier cleanup-
# race investigation, and now proven across 3 separate live failures to
# NOT be a cleanup/lock race) surfaced a DIFFERENT, unsolved failure mode:
# "no active session for <id>: context deadline exceeded" -- a dead gRPC
# session between the buildx CLI and the buildkitd container mid-`--load`
# export, exit code 1 (no signal -- not a cancellation). The two live
# candidates for WHY that session died -- transient network blip vs. the
# persistent, long-lived `gitea-persistent-builder` container degrading
# under sustained load across many builds -- cannot be told apart from
# this script's own stdout alone. This function captures exactly the
# evidence that WOULD distinguish them, from the one place likely to
# actually contain the answer: buildkitd's own logs (which run in a
# separate container from this script and are otherwise never looked at).
# Called only on a build failure (not on every run, to avoid log noise),
# every command defensively `|| true`'d -- diagnostics must never
# themselves fail the job.
dump_build_failure_diagnostics() {
  local label="$1"
  echo "----- [DIAG] BUILD FAILURE DIAGNOSTICS ($label)  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ') -----"
  echo "-- docker buildx inspect gitea-persistent-builder --"
  docker buildx inspect gitea-persistent-builder 2>&1 || true
  BUILDKIT_CONTAINER=$(docker ps -a --filter "name=buildx_buildkit_gitea-persistent-builder" --format '{{.Names}}' | head -1)
  if [ -n "${BUILDKIT_CONTAINER:-}" ]; then
    echo "-- docker inspect $BUILDKIT_CONTAINER (state/restarts/health) --"
    docker inspect "$BUILDKIT_CONTAINER" --format 'Status={{.State.Status}} StartedAt={{.State.StartedAt}} RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}} Error={{.State.Error}}' 2>&1 || true
    echo "-- docker stats --no-stream $BUILDKIT_CONTAINER (resource pressure at time of failure) --"
    docker stats --no-stream "$BUILDKIT_CONTAINER" 2>&1 || true
    echo "-- docker logs --tail 300 $BUILDKIT_CONTAINER (buildkitd's own logs -- the most direct evidence of WHY the session dropped: OOM, panic, network reset, etc.) --"
    docker logs --tail 300 "$BUILDKIT_CONTAINER" 2>&1 || true
  else
    echo "⚠️  Could not resolve the buildkitd container name -- builder may already be gone/recreated."
  fi
  echo "-- host resource context (free -h / uptime / df -h) --"
  free -h 2>&1 || true
  uptime 2>&1 || true
  df -h / 2>&1 || true
  echo "-- docker ps -a (what else is running on this shared runner right now) --"
  docker ps -a 2>&1 || true
  echo "----- [DIAG] END BUILD FAILURE DIAGNOSTICS ($label) -----"
}

# 1. BUILD via BuildKit, LOADED into the local Docker daemon (no push).
# `--load` is what routes the finished image into dockerd's own
# image store instead of BuildKit's native registry exporter —
# this is the exact mechanism Test 2 of the A/B test used, and it
# succeeded in 2-5s every time. Multi-stage builds, apt/npm cache
# mounts, and the local export-cache (--cache-from/--cache-to)
# all work identically to before; only the destination of the
# finished image changes (local daemon instead of the registry).
echo "===== BUILD (BuildKit, --load) ====="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
# HIGH FIX: shared (`-s`) flock around the actual build, using the
# same lock file the builder-setup step takes an EXCLUSIVE lock on
# around its recreate logic (see "Set up / Reuse Persistent Docker
# Buildx Builder" above). Shared locks don't block other shared
# locks, so any number of matrix builds still run fully
# concurrently against each other — this only ever blocks if a
# builder recreate is actively in progress, which then waits for
# every in-flight build to finish before it can proceed, and any
# new build waits for an in-progress recreate to finish first.
# This closes the gap a lock scoped only to the setup step would
# leave open: without this, a recreate in one job's setup step
# could still remove the builder while a DIFFERENT job's build
# step (a separate script invocation) was actively using it.
# (BUILDER_LOCKFILE is now defined earlier, alongside CACHE_DIR --
# see that definition's comment for why cleanup() also needs it.)
#
# ── Bounded retry for TRANSIENT build failures only (2026-08) ───────────
# CI PANIC INVESTIGATION follow-up: 3 separate live failures captured via
# the [DIAG] BUILD START/EXIT timestamps below all independently confirmed
# cleanup() is NOT racing this build (BUILD EXIT always precedes CLEANUP
# TRAP FIRED, lock always acquires near-instantly) -- that hypothesis is
# considered closed. Those same 3 runs surfaced two GENUINELY DIFFERENT
# failure classes that must be handled differently, not lumped together:
#   1. External cancellation (exit code >=128, i.e. killed by a signal --
#      130=SIGINT, 143=SIGTERM, 137=SIGKILL): this workflow's own
#      `concurrency: { cancel-in-progress: true }` intentionally kills an
#      in-flight run when a newer push lands. Retrying here would be
#      pointless (the whole job is already being torn down) and could
#      race that teardown -- re-raise the exit code immediately, exactly
#      as before this change.
#   2. Transient BuildKit session/connectivity failure (ordinary exit
#      code, e.g. 1 -- NOT a signal -- with build output matching a known
#      transient signature: "no active session", "context deadline
#      exceeded", "DeadlineExceeded", a dropped gRPC transport, etc.):
#      this is a dead session between the buildx CLI and the buildkitd
#      container, not an application/Dockerfile defect. A bounded retry
#      is the same pattern registry-repair.sh already uses for its own
#      transient `docker pull` failures (3 attempts) -- proven safe here
#      too, since --load's local cache (--cache-from=type=local) means a
#      retried build reuses this run's own cache-to output where
#      possible instead of starting cold.
#   3. Anything else (ordinary exit code, output does NOT match a known
#      transient signature): a real build/Dockerfile/application failure.
#      Retrying this would just waste CI time re-running a deterministic
#      failure and mask a real bug behind eventual-success flakiness --
#      fail immediately, exactly as before this change.
# Diagnostics (dump_build_failure_diagnostics, defined above) are captured
# on EVERY failed attempt regardless of category, specifically to build
# up the evidence needed to eventually root-cause category 2 for real
# (buildkitd's own logs, resource pressure, builder health) rather than
# continuing to only ever see it from the client side.
MAX_BUILD_ATTEMPTS=3
BUILD_ATTEMPT=1
BUILD_EXIT=1
while [ "$BUILD_ATTEMPT" -le "$MAX_BUILD_ATTEMPTS" ]; do
  BUILD_LOG="build_output_attempt${BUILD_ATTEMPT}_${IMAGE_NAME}.log"
  echo "[DIAG] BUILD START (image=$IMAGE_NAME) attempt=${BUILD_ATTEMPT}/${MAX_BUILD_ATTEMPTS}  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"
  # CI PANIC INVESTIGATION (2026-08): bracketed with `set +e`/`set -e` (not
  # a bare statement) so BUILD_EXIT can be captured and a `[DIAG] BUILD
  # EXIT` line logged UNCONDITIONALLY -- including on a failed/canceled
  # attempt -- before this script decides whether to retry or re-raise. A
  # bare failing statement here would otherwise trigger `set -e` and jump
  # straight to the `cleanup` trap, skipping this diagnostic (and the
  # retry decision) entirely. NOTE: if the runner kills this whole
  # script's process group directly (rather than just the child buildx
  # process), even the BUILD EXIT line may never run -- its absence from a
  # failed run's log is itself diagnostic evidence the parent script, not
  # just the build, was terminated.
  set +e
  (
    flock -s -w 120 200 || { echo "ERROR: could not acquire shared builder lock within 120s — a builder recreate may be stuck. Aborting build."; exit 1; }
    docker buildx build --load $BUILD_ARGS -t "$TAG_NAME" $CACHE_ARGS $ATTEST_ARGS $LABEL_ARGS --metadata-file build-metadata.json -f "${IMAGE_FILE}" "${IMAGE_CONTEXT}"
  ) 200>"$BUILDER_LOCKFILE" 2>&1 | tee "$BUILD_LOG"
  BUILD_EXIT=${PIPESTATUS[0]}
  set -e
  echo "[DIAG] BUILD EXIT (image=$IMAGE_NAME) attempt=${BUILD_ATTEMPT}/${MAX_BUILD_ATTEMPTS} exit_code=$BUILD_EXIT  UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')"

  if [ "$BUILD_EXIT" -eq 0 ]; then
    break
  fi

  if [ "$BUILD_EXIT" -ge 128 ]; then
    SIGNAL=$((BUILD_EXIT - 128))
    echo "🛑 Build attempt ${BUILD_ATTEMPT} was terminated by signal ${SIGNAL} (exit ${BUILD_EXIT}) -- this is an external cancellation (e.g. this workflow's own concurrency.cancel-in-progress firing because a newer push landed, or the runner tearing this job down), not a build defect. NOT retrying: the job is already being canceled, retrying would only race that teardown."
    dump_build_failure_diagnostics "attempt ${BUILD_ATTEMPT}, external cancellation"
    echo "❌ Build canceled (exit $BUILD_EXIT)."
    exit "$BUILD_EXIT"
  fi

  if grep -qE 'no active session for|context deadline exceeded|DeadlineExceeded|failed to receive status|transport is closing|error reading from server|i/o timeout' "$BUILD_LOG"; then
    if [ "$BUILD_ATTEMPT" -lt "$MAX_BUILD_ATTEMPTS" ]; then
      echo "⚠️  Build attempt ${BUILD_ATTEMPT} failed with a signature consistent with a TRANSIENT BuildKit session/connectivity issue (not an application/Dockerfile error) -- see diagnostics below. Retrying (attempt $((BUILD_ATTEMPT + 1))/${MAX_BUILD_ATTEMPTS})..."
      dump_build_failure_diagnostics "attempt ${BUILD_ATTEMPT}, transient -- retrying"
      BUILD_ATTEMPT=$((BUILD_ATTEMPT + 1))
      sleep 5
      continue
    else
      echo "❌ Build failed on the final allowed attempt (${BUILD_ATTEMPT}/${MAX_BUILD_ATTEMPTS}) with a transient-connectivity signature -- ${MAX_BUILD_ATTEMPTS} consecutive transient failures suggests a PERSISTENT issue (builder health, sustained runner resource pressure), not a one-off blip. See diagnostics below across all attempts."
      dump_build_failure_diagnostics "attempt ${BUILD_ATTEMPT}, transient -- attempts exhausted"
      exit "$BUILD_EXIT"
    fi
  fi

  echo "❌ Build attempt ${BUILD_ATTEMPT} failed with no known-transient signature -- treating as a real build/Dockerfile/application failure, not retrying."
  dump_build_failure_diagnostics "attempt ${BUILD_ATTEMPT}, non-transient"
  exit "$BUILD_EXIT"
done

echo "✅ Image built and loaded into local Docker daemon as $TAG_NAME"
docker images "$TAG_NAME"
# CRITICAL FIX: record this tag so cleanup() removes exactly this
# image (and only this image) instead of an unscoped image prune.
IMAGE_TAGS_CREATED+=("$TAG_NAME")

# 2. SMOKE TEST — against the LOCALLY LOADED image, before anything
# is pushed. Catches a broken image before it ever reaches the
# registry, and doesn't need a `docker pull` since --load already
# put it in the local daemon.
if [[ "${IMAGE_TYPE}" == "backend" ]]; then
  echo "Running smoke test for native modules on ${IMAGE_NAME} (local image)..."
  docker run --rm --entrypoint node "$TAG_NAME" -e "require('bcrypt'); console.log('bcrypt native module OK');"
  echo "✅ Smoke test passed."
fi

# 3. PUSH — classic Docker engine, single attempt, no retry.
# This is the exact path Test 1 / Test 2 of the A/B test proved
# reliable (2-5s, every run) — the same registry, same
# credentials, same repository as the native-push path that was
# timing out, just routed through dockerd's own registry client
# instead of BuildKit's.
echo "===== PUSH START (classic docker push) ====="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')  Local: $(date +'%Y-%m-%dT%H:%M:%S.%3N%z')"
start_time=$(date +%s)

# Plain local log of the push transcript — not uploaded anywhere,
# just useful if you need to scroll back through a long push in
# this run's own console/log output.
PUSH_SUCCESS=false
if docker push "$TAG_NAME" 2>&1 | tee push_output.log; then
  # Recorded FIRST, before any other command — a successful push
  # is already a fact at this point, and nothing that runs after
  # this line (e.g. the informational size lookup below) should
  # ever be able to retroactively turn it into a job failure.
  PUSH_SUCCESS=true

  end_time=$(date +%s)
  push_duration=$((end_time - start_time))
  echo "===== PUSH SUCCESS ====="
  echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')  duration: ${push_duration}s"

  # BEST-EFFORT ONLY — see PUSH_SUCCESS above, already true.
  # `docker manifest inspect` opens a fresh connection and pings
  # the registry independently of the push that just completed;
  # that ping can time out on its own ("error pinging v2
  # registry: ... context deadline exceeded") even though the
  # push already succeeded. This is purely a log line for
  # humans — nothing downstream reads $SIZE_BYTES — so its
  # result is checked explicitly and logged either way, rather
  # than silenced with a blanket `|| true`.
  echo "Computing image size (informational)..."
  if SIZE_BYTES=$(docker manifest inspect "$TAG_NAME" | jq '[.layers[].size] | add'); then
    echo "📊 Image Upload Size: $((SIZE_BYTES / 1024 / 1024)) MB"
  else
    echo "⚠️  Could not determine image size (registry query failed or timed out)."
    echo "This does not affect deployment — the image was already pushed successfully above."
  fi
else
  end_time=$(date +%s)
  push_duration=$((end_time - start_time))
  echo "===== PUSH FAILED ====="
  echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')  duration: ${push_duration}s"

  # Classic-push-path failure diagnostics, printed straight to the
  # console — no artifact upload involved, so nothing here depends
  # on a separate storage/upload service being healthy.
  echo "-- ss -tanp --"; ss -tanp 2>&1 || echo "(ss failed or requires root)"
  echo "-- docker info --"; docker info 2>&1 || true
  echo "-- GET https://${REGISTRY}/v2/ --"
  curl -v "https://${REGISTRY}/v2/" \
    -w '\n[TIMING] dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s http_code=%{http_code}\n' \
    --max-time 60 2>&1 || echo "[curl exited non-zero]"
fi

echo "===== JOB END (push phase) ====="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%S.%3NZ')  Local: $(date +'%Y-%m-%dT%H:%M:%S.%3N%z')"

# Cleanup no longer needs to be called manually here — the
# `trap cleanup EXIT` registered above fires automatically
# whichever way this script exits, including the `exit 1` right
# below on a failed push. See the trap's definition earlier in
# this step for what it does (scoped builder prune, image/
# container/volume prune, cache rotation, before/after
# `docker system df` for visibility).

if [ "$PUSH_SUCCESS" != "true" ]; then
   echo "❌ Push failed. Aborting immediately for clean timeline correlation."
   exit 1
fi

# 4. ALIAS TAG PROMOTION — classic `docker tag` + `docker push`,
# NOT `docker buildx imagetools create` (imagetools talks to the
# registry's OCI distribution API directly via buildx's own
# registry client — the same client whose push path is being
# avoided here — so it's not a safe substitute even though it
# doesn't re-transfer layers). No rebuild: retagging the image
# already sitting in the local daemon from the build above.
echo "===== ALIAS TAG PROMOTION (classic docker tag + push) ====="
docker tag "$TAG_NAME" "${BASE}/${IMAGE_NAME}:latest"
IMAGE_TAGS_CREATED+=("${BASE}/${IMAGE_NAME}:latest")
docker push "${BASE}/${IMAGE_NAME}:latest"
docker tag "$TAG_NAME" "${BASE}/${IMAGE_NAME}:hybrid-architecture"
IMAGE_TAGS_CREATED+=("${BASE}/${IMAGE_NAME}:hybrid-architecture")
docker push "${BASE}/${IMAGE_NAME}:hybrid-architecture"
if [ -n "$SEMVER" ]; then
  docker tag "$TAG_NAME" "${BASE}/${IMAGE_NAME}:$SEMVER"
  IMAGE_TAGS_CREATED+=("${BASE}/${IMAGE_NAME}:$SEMVER")
  docker push "${BASE}/${IMAGE_NAME}:$SEMVER"
fi
echo "✅ All tags pushed via classic Docker engine."
