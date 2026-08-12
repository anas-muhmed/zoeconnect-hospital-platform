#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Detect and repair missing carried-forward images
#
# Extracted from .gitea/workflows/deploy.yml's registry-repair job
# (2026-08) -- this step's shell body used to live inline in that job's
# `run:` block. Relocated here for the exact same reason
# build-and-push-image.sh was extracted from build-images' "Build and Push
# Image" step: a run: block with real shell logic (loops, an associative
# array, functions) sitting next to `${{ }}` expressions is the proven
# trigger for act_runner's Interpolate()/rewriteSubExpression() bug (see
# that script's own header for the full nektos/act source-level
# explanation). This step's own `run:` in deploy.yml now contains NO
# `${{ }}` at all -- every previously-inline expression is supplied below
# via this step's `env:` block instead, each one small and independent.
#
# This is a pure relocation: every comment, every safeguard, zero logic
# changes from the original inline step.
#
# Expected environment (set via deploy.yml's own env: block on this step):
#   BACKEND_CHANGED, FRONTEND_CHANGED, VENDOR_BACKEND_CHANGED,
#   VENDOR_FRONTEND_CHANGED, ZOECONNECT_CHANGED
#                              needs.detect-changes.outputs.*_changed --
#                              a service already rebuilt by build-images
#                              this run is skipped here entirely.
#   REGISTRY, IMAGE_NAMESPACE  workflow-level env vars.
#   GITHUB_SHA                 NOT set via this step's `env:` -- GITHUB_-
#                              prefixed names are reserved by the Actions
#                              runner and cannot be overridden there (same
#                              reasoning as build-and-push-image.sh's own
#                              header). Already auto-injected with the
#                              correct value; read directly below.
#
# Also expects, in the current working directory:
#   previous_manifest.yml     written by this job's own "Fetch previous
#                              release manifest" step, read via
#                              manifest-lib.sh's resolve_carry_forward_tag().
#   .gitea/scripts/build-and-push-image.sh
#                              invoked directly, per missing service, with
#                              SERVICE_KEY set for that one call -- the
#                              EXACT SAME script build-images uses, zero
#                              duplicated build logic.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail  # deliberately NOT -e: a repair failure must be reported with context (which service, what tag) before this job exits non-zero, not abort mid-echo
chmod +x .gitea/scripts/build-and-push-image.sh
source infrastructure/scripts/manifest-lib.sh

declare -A CHANGED=(
  [backend]="${BACKEND_CHANGED}"
  [frontend]="${FRONTEND_CHANGED}"
  [vendor_backend]="${VENDOR_BACKEND_CHANGED}"
  [vendor_frontend]="${VENDOR_FRONTEND_CHANGED}"
  [zoeconnect]="${ZOECONNECT_CHANGED}"
)
declare -A IMAGE_NAMES=(
  [backend]="hdsp-backend"
  [frontend]="hdsp-frontend"
  [vendor_backend]="hdsp-vendor-backend"
  [vendor_frontend]="hdsp-vendor-frontend"
  [zoeconnect]="hdsp-zoeconnect"
)

REPAIR_FAILED=false
for svc in backend frontend vendor_backend vendor_frontend zoeconnect; do
  if [ "${CHANGED[$svc]}" = "true" ]; then
    echo "⏭️  ${svc}: rebuilt by build-images this run already -- nothing to validate, nothing to repair."
    echo "${svc}_repaired=false" >> "$GITHUB_OUTPUT"
    continue
  fi

  # Same resolution + same fallback package-bundle's resolve_tag()
  # uses below, via the same shared function -- this job and
  # package-bundle can never compute a different answer for
  # "what tag would this service carry forward".
  tag=$(resolve_carry_forward_tag previous_manifest.yml "$svc")
  if [ -z "$tag" ]; then
    tag="hybrid-architecture"
    echo "ℹ️  ${svc}: no previous tag on record -- validating the 'hybrid-architecture' branch alias fallback instead (same fallback package-bundle's resolve_tag() will use if this stays unrepaired)."
  fi
  ref="${REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_NAMES[$svc]}:${tag}"

  ok=false
  for attempt in 1 2 3; do
    if docker pull "$ref" >/tmp/repair_check_stdout.log 2>/tmp/repair_check_stderr.log; then
      ok=true
      break
    fi
    echo "  (attempt ${attempt}/3 failed for ${ref}, retrying...)"
    sleep 2
  done

  if [ "$ok" = "true" ]; then
    echo "✅ ${svc}: ${ref} pulled successfully -- carried-forward tag is still valid, no repair needed."
    echo "${svc}_repaired=false" >> "$GITHUB_OUTPUT"
    continue
  fi

  echo "❌ ${svc}: ${ref} could not be pulled -- carried-forward tag is missing from the registry:"
  cat /tmp/repair_check_stderr.log 2>/dev/null || true
  # $GITHUB_SHA (not `${{ github.sha }}`) deliberately -- this script has
  # real shell logic (loops, an associative array) around it; see this
  # file's own header, and build-and-push-image.sh's, for why a live
  # `${{ }}` expression inside a substantial run: block is the exact
  # pattern proven to trigger act_runner's interpolation bug. GITHUB_SHA
  # is the runner's own auto-injected env var, identical value, zero
  # interpolation risk -- and now moot anyway, since this logic no longer
  # lives inside a workflow run: block at all.
  echo "🔧 Repairing: rebuilding ${svc} from this run's own commit (${GITHUB_SHA}) via build-and-push-image.sh..."

  if SERVICE_KEY="$svc" .gitea/scripts/build-and-push-image.sh; then
    echo "✅ ${svc}: repair build succeeded and pushed under this run's tag."
    echo "${svc}_repaired=true" >> "$GITHUB_OUTPUT"
  else
    echo "🛑 ${svc}: repair build FAILED. Per explicit policy, this is a hard stop -- no fallback to the missing tag, 'latest', or a branch alias. Deploying now would produce an inconsistent release (some services from the current commit, this one from a historical image that no longer exists), exactly what manifest validation exists to prevent."
    echo "${svc}_repaired=false" >> "$GITHUB_OUTPUT"
    REPAIR_FAILED=true
  fi
done

if [ "$REPAIR_FAILED" = "true" ]; then
  exit 1
fi
