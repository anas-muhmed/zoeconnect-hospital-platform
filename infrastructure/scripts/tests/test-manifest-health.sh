#!/bin/bash
# ==============================================================================
# Regression tests -- release-aware health checks (manifest-lib.sh)
# ==============================================================================
# Plain bash + assertions, no test framework dependency added -- matches
# this codebase's existing convention (detect-changes.sh, resolve-package-
# deps.sh etc. are all dependency-free bash, and there's no bats/shunit2
# already vendored anywhere in this repo). Run directly:
#   bash infrastructure/scripts/tests/test-manifest-health.sh
# Exits 0 with a summary if every assertion passes, exits 1 on first
# failure with a clear diff of expected vs actual.
#
# Covers exactly the five scenarios called out for this feature:
#   1. New release with health URLs defined.
#   2. Old manifest with no health: block at all (pre-feature release).
#   3. Rollback to a historical release (same code path as #2, from
#      rollback.sh's perspective -- exercised via get_service_ready_url
#      directly rather than spinning up rollback.sh's full Docker
#      dependency chain, which is out of scope for a pure manifest-parsing
#      unit test).
#   4. Deployment using the current release (full health: block, both
#      ready and live, multiple services).
#   5. A service entry missing from an otherwise-present health: block
#      (e.g. a service added to the schema before this specific service
#      got a health section written for it).
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../manifest-lib.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS=0
FAIL=0

assert_eq() {
    local desc="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "  ok   - $desc"
        PASS=$((PASS + 1))
    else
        echo "  FAIL - $desc"
        echo "         expected: [$expected]"
        echo "         actual:   [$actual]"
        FAIL=$((FAIL + 1))
    fi
}

# ------------------------------------------------------------------------
# Scenario 1 + 4: current-format release, full health: block, multiple
# services, both ready and live fields, one service with an empty live.
# ------------------------------------------------------------------------
cat > "${TMP_DIR}/current_release.yml" <<'EOF'
          release:
            commit: 0312028c218bd9ef29156fa9452009faad5c4c0
            short_sha: 0312028
            branch: hybrid-architecture

          images:
            backend:
              tag: 0312028
            vendor_backend:
              tag: 0312028
            frontend:
              tag: hybrid-architecture

          health:
            backend:
              ready: "http://localhost:3001/api/v1/health/ready"
              live: "http://localhost:3001/api/v1/health/live"
            vendor_backend:
              ready: "http://localhost:4000/api/health/ready"
              live: "http://localhost:4000/api/health/live"
            frontend:
              ready: "http://localhost:3000/"
              live: ""
EOF

echo "=== Scenario 1/4: current release, full health: block ==="
assert_eq "backend ready URL" \
    "http://localhost:3001/api/v1/health/ready" \
    "$(get_service_ready_url "${TMP_DIR}/current_release.yml" backend)"
assert_eq "backend live URL" \
    "http://localhost:3001/api/v1/health/live" \
    "$(get_service_live_url "${TMP_DIR}/current_release.yml" backend)"
assert_eq "vendor_backend ready URL" \
    "http://localhost:4000/api/health/ready" \
    "$(get_service_ready_url "${TMP_DIR}/current_release.yml" vendor_backend)"
assert_eq "vendor_backend live URL" \
    "http://localhost:4000/api/health/live" \
    "$(get_service_live_url "${TMP_DIR}/current_release.yml" vendor_backend)"
assert_eq "frontend ready URL" \
    "http://localhost:3000/" \
    "$(get_service_ready_url "${TMP_DIR}/current_release.yml" frontend)"
assert_eq "frontend live URL (explicitly empty in manifest)" \
    "" \
    "$(get_service_live_url "${TMP_DIR}/current_release.yml" frontend)"
assert_eq "image tag reading still works alongside health: block" \
    "0312028" \
    "$(extract_image_tag "${TMP_DIR}/current_release.yml" vendor_backend)"
assert_eq "release short_sha reading still works alongside health: block" \
    "0312028" \
    "$(extract_release_short_sha "${TMP_DIR}/current_release.yml")"

# ------------------------------------------------------------------------
# Scenario 2 + 3: old manifest, no health: block at all -- exactly what
# a835376's manifest.yml looked like before this feature existed, and
# exactly what rollback.sh must be able to roll back to safely.
# ------------------------------------------------------------------------
cat > "${TMP_DIR}/old_release.yml" <<'EOF'
          release:
            commit: a835376ed455937a17cac01abf7d6625a317c36b
            short_sha: a835376
            branch: hybrid-architecture

          images:
            backend:
              tag: a835376
            vendor_backend:
              tag: a835376
EOF

echo "=== Scenario 2/3: pre-feature manifest, no health: block (rollback target) ==="
assert_eq "old manifest: vendor_backend ready URL is empty, not an error" \
    "" \
    "$(get_service_ready_url "${TMP_DIR}/old_release.yml" vendor_backend)"
assert_eq "old manifest: vendor_backend live URL is empty, not an error" \
    "" \
    "$(get_service_live_url "${TMP_DIR}/old_release.yml" vendor_backend)"
assert_eq "old manifest: backend ready URL is empty, not an error" \
    "" \
    "$(get_service_ready_url "${TMP_DIR}/old_release.yml" backend)"
get_service_ready_url "${TMP_DIR}/old_release.yml" vendor_backend > /dev/null 2>&1
assert_eq "old manifest: reader exits 0, never fails" "0" "$?"
assert_eq "old manifest: image tag reading is completely unaffected" \
    "a835376" \
    "$(extract_image_tag "${TMP_DIR}/old_release.yml" vendor_backend)"

# ------------------------------------------------------------------------
# Scenario 5: health: block present, but no entry for a specific service
# (e.g. zoeconnect added to the schema before it had a health section).
# ------------------------------------------------------------------------
cat > "${TMP_DIR}/partial_release.yml" <<'EOF'
          release:
            commit: abc1234
            short_sha: abc1234

          images:
            backend:
              tag: abc1234
            zoeconnect:
              tag: abc1234

          health:
            backend:
              ready: "http://localhost:3001/api/v1/health/ready"
              live: "http://localhost:3001/api/v1/health/live"
EOF

echo "=== Scenario 5: health: block present, service entry missing ==="
assert_eq "backend (present in health:) ready URL resolves" \
    "http://localhost:3001/api/v1/health/ready" \
    "$(get_service_ready_url "${TMP_DIR}/partial_release.yml" backend)"
assert_eq "zoeconnect (absent from health:) ready URL is empty, not an error" \
    "" \
    "$(get_service_ready_url "${TMP_DIR}/partial_release.yml" zoeconnect)"
assert_eq "a service key that doesn't exist ANYWHERE in the manifest also degrades to empty" \
    "" \
    "$(get_service_ready_url "${TMP_DIR}/partial_release.yml" vendor_frontend)"

# ------------------------------------------------------------------------
# Edge case: manifest file doesn't exist at all (e.g. a caller constructs
# a path incorrectly) -- must degrade the same way, never crash the caller.
# ------------------------------------------------------------------------
echo "=== Edge case: manifest file does not exist ==="
assert_eq "missing file: ready URL is empty, not an error" \
    "" \
    "$(get_service_ready_url "${TMP_DIR}/does_not_exist.yml" backend)"
get_service_ready_url "${TMP_DIR}/does_not_exist.yml" backend > /dev/null 2>&1
assert_eq "missing file: reader exits 0, never fails" "0" "$?"

echo ""
echo "============================================"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "============================================"
[ "$FAIL" -eq 0 ]
