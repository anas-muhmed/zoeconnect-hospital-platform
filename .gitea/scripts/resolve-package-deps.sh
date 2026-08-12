#!/bin/bash
set -euo pipefail

# ==============================================================================
# HDSP CI — automatic local-workspace dependency resolution
# ==============================================================================
#
# Given a service's workspace_root (the directory containing its
# package.json), prints the full TRANSITIVE closure of local ("file:")
# workspace dependencies it imports, one repo-relative directory per line.
#
# This is what makes the package -> service graph automatic instead of
# hand-maintained: detect-changes.sh does not know, and does not need to
# know, that "backend imports packages/form-schema" — it just asks this
# script "what does backend/ depend on locally?" and gets the real answer
# by reading backend/package.json (and then, recursively, whatever THAT
# depends on, e.g. connector/package.json -> packages/oracle-client).
#
# A "file:" dependency is npm's own on-disk marker for "this isn't a
# registry package, it's a local workspace/relative path" -- exactly what
# an npm/yarn workspace produces for `packages/*` and any other
# locally-linked package (e.g. connector/, which is a real top-level
# directory outside packages/ but functions identically as far as the
# dependency graph is concerned). No assumption is made about directory
# naming conventions; only "file:" values in package.json are trusted.
#
# Usage:
#   resolve-package-deps.sh <workspace-root-relative-to-repo-root>
# Prints zero or more repo-relative directory paths, one per line, with no
# duplicates (a diamond dependency -- e.g. two packages both depending on
# packages/oracle-client -- is only printed once, and cycles are guarded
# against defensively even though a real cycle would itself be an npm
# workspace error).
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
declare -A VISITED=()

resolve_deps() {
    local workspace_dir="$1"   # repo-relative, no leading/trailing slash
    local pkg_json="${REPO_ROOT}/${workspace_dir}/package.json"

    [ -f "$pkg_json" ] || return 0

    # Pull every "file:..." value out of dependencies/devDependencies.
    # Deliberately done with grep rather than a JSON parser: package.json
    # is machine-written by npm, so quoting is always well-formed, and this
    # avoids adding a JSON/YAML library dependency to the CI runner for a
    # one-line extraction.
    local file_deps
    file_deps=$(grep -oE '"file:[^"]+"' "$pkg_json" 2>/dev/null | tr -d '"' | sed 's/^file://') || true

    while IFS= read -r rel_path; do
        [ -z "$rel_path" ] && continue

        local resolved
        resolved="$(cd "${REPO_ROOT}/${workspace_dir}/${rel_path}" 2>/dev/null && pwd)" || {
            echo "::warning::resolve-package-deps.sh: '${workspace_dir}' declares a file: dependency on '${rel_path}', which does not resolve to a real directory. Skipping (this dependency will NOT trigger rebuilds if it changes)." >&2
            continue
        }
        local resolved_rel="${resolved#"${REPO_ROOT}"/}"

        if [ -n "${VISITED[$resolved_rel]:-}" ]; then
            continue
        fi
        VISITED["$resolved_rel"]=1

        echo "$resolved_rel"
        resolve_deps "$resolved_rel"
    done <<< "$file_deps"
}

if [ $# -ne 1 ]; then
    echo "Usage: $0 <workspace-root-relative-to-repo-root>" >&2
    exit 1
fi

resolve_deps "$1"
