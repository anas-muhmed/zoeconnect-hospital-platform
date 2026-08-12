#!/bin/bash
set -euo pipefail

# ==============================================================================
# HDSP CI — incremental-build change detection
# ==============================================================================
#
# Single source of truth for "which paths in this repo map to which Docker
# image(s)". Every job in .gitea/workflows/deploy.yml that needs to know
# whether it should run consumes THIS script's outputs -- nothing else in
# the workflow duplicates a path pattern.
#
# ── Where the rules actually live (2026-08 revision) ─────────────────────
# Two layers, on purpose, because they change for different reasons and at
# different rates:
#
#   1. ci/dependencies.yml -- each service's OWN paths (source dir,
#      Dockerfile) plus its `workspace_root`. Hand-maintained, because
#      "backend's source lives at backend/" isn't derivable from anything.
#      This script parses that file directly (grep/awk — no YAML library
#      added to the runner, same convention manifest.yml already uses).
#
#   2. The packages/* (and connector/) dependency graph -- NOT
#      hand-maintained anywhere. resolve-package-deps.sh reads each
#      service's package.json at run time and follows every "file:"
#      workspace dependency, transitively, to build the real answer to
#      "what local packages does this service actually import". Adding
#      packages/pdf-engine and wiring a service to import it next year
#      requires editing that service's package.json (which you'd do
#      anyway, to use the package) and NOTHING else -- no rule to add
#      here, in ci/dependencies.yml, or in deploy.yml.
#
# ── Adding a new service (e.g. analytics/) ──────────────────────────────
# 1. Add a `services.analytics` block to ci/dependencies.yml (paths +
#    workspace_root).
# 2. Add its CHANGED[...] key below and one MATRIX_ENTRIES block near the
#    bottom (image name / build context / type -- metadata that isn't part
#    of the path-dependency graph, so it isn't in ci/dependencies.yml).
# 3. Add a matching FORCE_ANALYTICS line to the "Force-rebuild override"
#    section below, and a `force_analytics` input to deploy.yml's
#    `workflow_dispatch.inputs` (see that section's own comment for why
#    this is a plain env-var flag, not a separate code path).
# Nothing else in .gitea/workflows/deploy.yml needs to change -- it only
# ever reads this script's outputs.
#
# ── Usage ────────────────────────────────────────────────────────────────
#   detect-changes.sh <before-sha> <after-sha>
# Writes `key=value` lines suitable for appending directly to $GITHUB_OUTPUT.
# Reads optional FORCE_REBUILD / FORCE_<SERVICE> env vars -- see
# "Force-rebuild override" below.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPENDENCIES_FILE="${REPO_ROOT}/ci/dependencies.yml"
RESOLVE_DEPS="${SCRIPT_DIR}/resolve-package-deps.sh"

if [ ! -f "$DEPENDENCIES_FILE" ]; then
    echo "[ERROR] ${DEPENDENCIES_FILE} not found -- this is the single source of truth for service path rules and cannot be skipped." >&2
    exit 1
fi

BEFORE="${1:-}"
AFTER="${2:-HEAD}"
ZERO_SHA="0000000000000000000000000000000000000000"

ALL_CHANGED=false
if [ -z "$BEFORE" ] || [ "$BEFORE" = "$ZERO_SHA" ]; then
    # First push to this branch (or Gitea didn't give us a real "before"
    # SHA for some other reason) -- there is no prior commit to diff
    # against. The only safe default is "everything changed": silently
    # skipping builds because we couldn't determine what changed would be
    # exactly the kind of non-deterministic behavior this feature must
    # never produce.
    echo "::notice::No valid previous commit to diff against (first push, or history rewrite) -- treating every service as changed." >&2
    ALL_CHANGED=true
    CHANGED_FILES=""
else
    CHANGED_FILES=$(git diff --name-only "$BEFORE" "$AFTER")
fi

# --- Parse ci/dependencies.yml ----------------------------------------------
# Deliberately not a general YAML parser -- this file's structure is fixed
# and small (2-space indents, one `- path` per line), so a small awk state
# machine is enough and adds zero new tooling dependency to the runner.
PARSED=$(awk '
    { line = $0; sub(/\r$/, "", line) }
    line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/ { next }
    {
        match(line, /^[ ]*/)
        indent = RLENGTH
        content = line
        sub(/^[ ]*/, "", content)
    }
    indent == 0 {
        if (content == "services:") { section = "services"; svc = ""; in_paths = 0 }
        else if (content == "infra:") { section = "infra"; svc = ""; in_paths = 0 }
        next
    }
    section == "services" && indent == 2 {
        if (content ~ /:$/) { svc = content; sub(/:$/, "", svc); in_paths = 0 }
        next
    }
    section == "services" && indent == 4 {
        if (content ~ /^workspace_root:/) {
            root = content; sub(/^workspace_root:[ ]*/, "", root)
            print "SERVICE_ROOT|" svc "|" root
            in_paths = 0
        } else if (content == "paths:") {
            in_paths = 1
        }
        next
    }
    section == "services" && indent == 6 && in_paths {
        p = content; sub(/^-[ ]*/, "", p)
        print "SERVICE_PATH|" svc "|" p
        next
    }
    section == "infra" && indent == 2 && content == "paths:" { in_paths = 1; next }
    section == "infra" && indent == 4 && in_paths {
        p = content; sub(/^-[ ]*/, "", p)
        print "INFRA_PATH|" p
        next
    }
' "$DEPENDENCIES_FILE")

declare -A WORKSPACE_ROOT=()
declare -a SERVICE_ORDER=()
declare -A SEEN_SVC=()
RULES=()
INFRA_PATTERNS=()

while IFS='|' read -r kind a b; do
    case "$kind" in
        SERVICE_ROOT)
            WORKSPACE_ROOT["$a"]="$b"
            if [ -z "${SEEN_SVC[$a]:-}" ]; then SEEN_SVC[$a]=1; SERVICE_ORDER+=("$a"); fi
            ;;
        SERVICE_PATH)
            RULES+=("${a}:${b}")
            if [ -z "${SEEN_SVC[$a]:-}" ]; then SEEN_SVC[$a]=1; SERVICE_ORDER+=("$a"); fi
            ;;
        INFRA_PATH)
            RULES+=("infra:${a}")
            ;;
    esac
done <<< "$PARSED"

if [ "${#SERVICE_ORDER[@]}" -eq 0 ]; then
    echo "[ERROR] Parsed zero services out of ${DEPENDENCIES_FILE} -- refusing to continue with an empty rule set (this would silently build nothing, ever, regardless of what changed)." >&2
    exit 1
fi

# --- Auto-discovered package dependency graph -------------------------------
# For every service that declares a workspace_root, ask
# resolve-package-deps.sh what it actually imports locally (transitively),
# and turn each result into a "<service>:<dir>/**" rule -- exactly the kind
# of rule that used to be hand-written per package here.
#
# CRITICAL FIX (permission-denied incident, 2026-08): invoked via `bash
# "$RESOLVE_DEPS" ...` rather than executing the file directly. git only
# tracks this file's mode as 100644 (non-executable) -- deploy.yml's
# `chmod +x .gitea/scripts/detect-changes.sh` step only covers the script
# it names, not scripts THAT script shells out to, so a fresh checkout
# always restored resolve-package-deps.sh without its executable bit and
# every call site here failed with "Permission denied" (silently, since
# the `while read` loop just then sees zero lines and moves on -- no
# auto-discovered rules were ever generated). Invoking via `bash` sidesteps
# the executable-bit/shebang mechanism entirely, so this is immune to the
# file's git-tracked mode regardless of how it's checked out. Also set
# the tracked mode to 755 below for cleanliness, but the `bash` invocation
# is the real, durable fix -- it doesn't depend on that staying correct.
for svc in "${SERVICE_ORDER[@]}"; do
    root="${WORKSPACE_ROOT[$svc]:-}"
    [ -z "$root" ] && continue
    while IFS= read -r dep_dir; do
        [ -z "$dep_dir" ] && continue
        RULES+=("${svc}:${dep_dir}/**")
    done < <(bash "$RESOLVE_DEPS" "$root")
done

# --- Evaluate rules against the changed-file list ----------------------------
declare -A CHANGED=()
for svc in "${SERVICE_ORDER[@]}"; do CHANGED[$svc]=false; done
CHANGED[infra]=false

if [ "$ALL_CHANGED" = "true" ]; then
    for key in "${!CHANGED[@]}"; do CHANGED[$key]=true; done
else
    while IFS= read -r file; do
        [ -z "$file" ] && continue
        for rule in "${RULES[@]}"; do
            svc="${rule%%:*}"
            pattern="${rule#*:}"
            # Plain bash `case` globs (not globstar): `*` already matches
            # `/` here, so "backend/**" and "backend/*" behave identically
            # -- written as `**` to match this repo's own documented
            # convention for "this directory and everything under it".
            case "$file" in
                $pattern) CHANGED[$svc]=true ;;
            esac
        done
    done <<< "$CHANGED_FILES"
fi

# --- Force-rebuild override (manual escape hatch, 2026-08) ------------------
# CRITICAL FEATURE: production incident -- vendor_backend's carried-forward
# manifest tag (263055a) no longer existed in the registry ("manifest
# unknown") because vendor_backend_changed=false skipped its build on a run
# where it should have been rebuilt (or the tag was later removed from the
# registry out from under a manifest that still referenced it). The
# "Validate manifest images exist in registry" step in package-bundle
# caught this correctly and blocked a broken deploy -- exactly as designed,
# and NOT being weakened or bypassed here. What was missing was an operator
# escape hatch: a way to force one, several, or all services to rebuild
# regardless of what the path-based diff above concluded.
#
# Deliberately applied HERE -- after the normal path-based CHANGED[] pass
# above, before any output is emitted below -- so this is the ONLY place in
# the entire pipeline that knows a force happened. Every consumer
# downstream (build matrix generation immediately below, build-images,
# resolve_tag()'s tag carry-forward in package-bundle, manifest validation,
# deploy) sees an indistinguishable CHANGED[vendor_backend]=true whether it
# came from a real path change or a forced one -- no special case exists,
# or needs to exist, anywhere else. This keeps detect-changes.sh the single
# source of truth for build decisions, per this file's own header comment.
#
# Read from plain env vars (set by deploy.yml's "Detect changed paths" step
# from `github.event.inputs.*` on a workflow_dispatch run; unset/"false" on
# every other trigger, which is exactly today's behavior -- a `push` never
# sets these, so nothing changes for the default path). FORCE_REBUILD=true
# is intentionally NOT a separate branch of logic -- it only sets the same
# per-service FORCE_<SERVICE> flags this block already understands one line
# below, so there is exactly one mechanism here, not two.
if [ "${FORCE_REBUILD:-false}" = "true" ]; then
    echo "::notice::FORCE_REBUILD=true -- marking every service as changed (manual override for this run only; path-based detection above is unaffected and will run exactly the same on the next push)." >&2
    FORCE_BACKEND=true
    FORCE_FRONTEND=true
    FORCE_VENDOR_BACKEND=true
    FORCE_VENDOR_FRONTEND=true
    FORCE_ZOECONNECT=true
fi
[ "${FORCE_BACKEND:-false}" = "true" ]         && { echo "::notice::force_backend=true -- forcing backend rebuild." >&2; CHANGED[backend]=true; }
[ "${FORCE_FRONTEND:-false}" = "true" ]        && { echo "::notice::force_frontend=true -- forcing frontend rebuild." >&2; CHANGED[frontend]=true; }
[ "${FORCE_VENDOR_BACKEND:-false}" = "true" ]  && { echo "::notice::force_vendor_backend=true -- forcing vendor_backend rebuild." >&2; CHANGED[vendor_backend]=true; }
[ "${FORCE_VENDOR_FRONTEND:-false}" = "true" ] && { echo "::notice::force_vendor_frontend=true -- forcing vendor_frontend rebuild." >&2; CHANGED[vendor_frontend]=true; }
[ "${FORCE_ZOECONNECT:-false}" = "true" ]      && { echo "::notice::force_zoeconnect=true -- forcing zoeconnect rebuild." >&2; CHANGED[zoeconnect]=true; }

echo "backend_changed=${CHANGED[backend]:-false}"
echo "frontend_changed=${CHANGED[frontend]:-false}"
echo "vendor_backend_changed=${CHANGED[vendor_backend]:-false}"
echo "vendor_frontend_changed=${CHANGED[vendor_frontend]:-false}"
echo "zoeconnect_changed=${CHANGED[zoeconnect]:-false}"
echo "infra_changed=${CHANGED[infra]:-false}"

# --- Dynamic build matrix ----------------------------------------------------
# Only the SERVICE KEYS that actually need building -- consumed by
# build-images' `strategy.matrix: { service_key: ${{ fromJson(...) }} }`. A
# key that isn't in this array never runs at all (not "runs and gets
# skipped" -- genuinely absent from the matrix), which is what gives a
# fully infrastructure-only push zero build overhead instead of five fast
# no-ops.
#
# CRITICAL FIX (act_runner matrix-evaluation incompatibility, 2026-08):
# this used to emit an array of JSON OBJECTS (name/context/file/type/
# service_key per entry), consumed via `strategy.matrix.include:
# fromJson(...)`. Proven via direct production evidence: the exact same
# `needs.detect-changes.outputs.build_matrix` string was correct and valid
# JSON everywhere it was read via plain step-level `${{ }}` substitution
# (including a diagnostic dump inside build-images itself), yet
# `fromJson()` used specifically inside `strategy.matrix.include`
# (evaluated at job-scheduling time, a different code path/phase than
# step-level substitution) still resolved to `{}`. That isolates the fault
# to act_runner's matrix-strategy resolver for a dynamic, object-array
# `needs.*.outputs.*` value -- not to this script (its string output was
# independently proven correct) and not to workflow syntax (the YAML is
# spec-valid standard GitHub Actions).
#
# The fix: cross that specific, proven-fragile boundary with the simplest
# possible JSON shape -- a flat array of bare service-key strings -- and
# move the static per-service metadata (name / Dockerfile / context /
# type) into the workflow file itself as an inline lookup keyed by
# service_key. That metadata was ALREADY documented as build metadata, not
# path-dependency data ("they don't change when the dependency graph
# changes, only when a new service is actually added" -- see below); only
# its transport mechanism changes here. Which services build is still
# 100% dynamic and unmodified -- sourced from detect-changes.sh exactly as
# before, nothing hardcoded or bypassed.
#
# Image name / build context / "type" tag are Docker build metadata, not
# path-dependency rules, so they're intentionally NOT in ci/dependencies.yml
# -- they don't change when the dependency graph changes, only when a new
# service is actually added. (See build-images' inline SERVICE_KEY lookup
# in deploy.yml for where this metadata now lives.)
MATRIX_ENTRIES=()
[ "${CHANGED[backend]:-false}" = "true" ]         && MATRIX_ENTRIES+=("backend")
[ "${CHANGED[frontend]:-false}" = "true" ]        && MATRIX_ENTRIES+=("frontend")
[ "${CHANGED[vendor_backend]:-false}" = "true" ]  && MATRIX_ENTRIES+=("vendor_backend")
[ "${CHANGED[vendor_frontend]:-false}" = "true" ] && MATRIX_ENTRIES+=("vendor_frontend")
[ "${CHANGED[zoeconnect]:-false}" = "true" ]      && MATRIX_ENTRIES+=("zoeconnect")

if [ "${#MATRIX_ENTRIES[@]}" -eq 0 ]; then
    BUILD_MATRIX="[]"
    ANY_BUILD_NEEDED=false
else
    # jq -R (raw input) -s (slurp all lines into one string) turns the
    # newline-separated bareword list into a proper JSON array of quoted
    # strings -- e.g. ["vendor_backend","zoeconnect"] -- still fully valid
    # JSON, just the simplest possible shape (no nested objects) crossing
    # the fragile needs.outputs -> strategy.matrix boundary.
    BUILD_MATRIX=$(printf '%s\n' "${MATRIX_ENTRIES[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))')
    ANY_BUILD_NEEDED=true
fi

echo "any_build_needed=${ANY_BUILD_NEEDED}"

# CRITICAL FIX (matrix quote-corruption incident, 2026-08): build_matrix is
# the only output on this script that contains double-quote characters
# (it's a JSON array -- quoted keys, quoted string values). A real CI run's
# own diagnostic dump (added earlier this incident specifically to catch
# this class of bug) showed the value arriving at the consuming job as
# `[{name:hdsp-vendor-backend,context:.,file:docker/vendor-backend.Dockerfile,
# type:backend,service_key:vendor_backend}]` -- every single `"` character
# gone, while every OTHER output on this same step (all quote-free booleans)
# came through untouched. That isolates the corruption specifically to
# something in act_runner's plain `key=value` single-line $GITHUB_OUTPUT
# parser mishandling embedded quote characters -- NOT a bug in this script
# (jq -sc '.' guarantees valid quoted JSON going in) and NOT a bug in
# detect-changes.yml's consumption of this output.
#
# GitHub Actions' own docs define a multi-line `key<<DELIMITER` / value /
# `DELIMITER` output format specifically to carry complex/special-character
# values through $GITHUB_OUTPUT safely -- switching build_matrix (only) to
# that format here. Every other output above is untouched (working fine).
BUILD_MATRIX_DELIM="ghadelim_${RANDOM}_$$"
echo "build_matrix<<${BUILD_MATRIX_DELIM}"
echo "${BUILD_MATRIX}"
echo "${BUILD_MATRIX_DELIM}"
