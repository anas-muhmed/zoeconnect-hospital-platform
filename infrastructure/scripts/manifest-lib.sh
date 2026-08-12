# ==============================================================================
# manifest-lib.sh — shared manifest.yml field extraction
# ==============================================================================
# Sourced (not executed) by four separate contexts that all need to read
# fields out of a release's manifest.yml, and previously each reimplemented
# their own grep/awk for it:
#   - deploy.sh / rollback.sh, on the OCI deployment host
#   - the "Package Deployment Assets" step in .gitea/workflows/deploy.yml,
#     on the ephemeral CI runner, reading a PREVIOUS release's manifest to
#     resolve tags for services skipped by the incremental build pipeline
#   - the registry-repair job in .gitea/workflows/deploy.yml (2026-08),
#     reading that SAME previous manifest to decide which carried-forward
#     tags actually need validating against the registry before
#     package-bundle ever runs -- see resolve_carry_forward_tag() below
#
# Deliberately kept to just these two small extraction functions -- this is
# NOT the broader "extract all duplicated deploy.sh/rollback.sh logic into
# lib.sh" refactor that was explicitly deferred until the deployment
# pipeline has proven itself stable over several real deployments. That
# deferral was about not increasing the blast radius of already-working,
# already-duplicated code for pure cleanliness. This is different: net-new
# capability (per-service tag extraction) needed by the incremental-build
# feature, which didn't exist in any form before and would otherwise have
# to be written from scratch three times.
#
# Pure grep/awk/sed -- deliberately no python/yq/jq dependency here. This
# file is sourced by deploy.sh/rollback.sh on the production OCI host,
# which is only guaranteed to have Docker, bash, and standard coreutils
# (the CI runner side has more tooling available, but sharing one
# implementation across both contexts means it can only rely on what BOTH
# environments actually have).
# ==============================================================================

# extract_release_short_sha <manifest-file>
# Reads the single, unique `release.short_sha` field. Matched by key name
# with a leading-whitespace-tolerant regex, not by counting lines after
# "release:", so it doesn't break if fields are reordered or the file's
# indentation ever changes (it's generated inside a YAML `run: |` heredoc,
# so its literal on-disk indentation is a byproduct of the workflow file's
# own formatting, not something callers should depend on).
extract_release_short_sha() {
    local file="$1"
    grep -E "^[[:space:]]*short_sha:" "$file" | awk '{print $2}'
}

# extract_image_tag <manifest-file> <service-key>
# Reads the `tag:` field nested under a specific service key inside the
# `images:` block (e.g. "backend", "vendor_backend" -- matching manifest.yml's
# actual key names exactly). Unlike short_sha, `tag:` appears once PER
# SERVICE (five times total), so this can't just grep for the field name --
# it has to track which service block it's currently inside.
#
# Indentation-agnostic: strips leading whitespace before comparing, so it
# doesn't care about the manifest's actual on-disk indentation depth.
# Stops looking the moment it sees a different bare "key:" line at the same
# level, so it can never accidentally read a sibling service's tag.
extract_image_tag() {
    local file="$1"
    local service="$2"
    awk -v svc="${service}:" '
        {
            line = $0
            gsub(/^[ \t]+/, "", line)
        }
        line == svc { in_target = 1; next }
        in_target && line ~ /^tag:/ {
            split(line, parts, ":")
            gsub(/[ \t"]+/, "", parts[2])
            print parts[2]
            exit
        }
        in_target && line ~ /^[A-Za-z_]+:/ { in_target = 0 }
    ' "$file"
}

# resolve_carry_forward_tag <previous-manifest-file> <service-key>
# ==============================================================================
# CRITICAL FEATURE (registry-repair, 2026-08): thin, explicitly-named
# wrapper around extract_image_tag(), used specifically for the "this
# service was not rebuilt this run -- what tag would it carry forward"
# question. Factored out here (rather than left as an inline function
# copy-pasted into both consumers) so package-bundle's "Package Deployment
# Assets" step (deciding what tag to WRITE into the new manifest.yml) and
# the registry-repair job (deciding what tag to VALIDATE against the
# registry, and rebuild if missing, BEFORE package-bundle ever runs) can
# never disagree about what "carried forward" means for a given service --
# both call this exact function against the exact same previous_manifest.yml.
# Two call sites computing the same answer two different ways was exactly
# the kind of drift risk this whole feature depends on not having.
#
# Empty output (never a nonzero exit) means there is no previous tag on
# record for this service -- same "not found, not an error" convention
# extract_image_tag/get_service_health_field already use. Callers decide
# their own fallback (package-bundle's resolve_tag() falls back to the
# 'hybrid-architecture' branch alias; registry-repair does the same, so
# both fall back identically too) -- this helper deliberately does not
# invent one on their behalf.
resolve_carry_forward_tag() {
    local file="$1"
    local service="$2"
    [ -f "$file" ] && [ -s "$file" ] || { echo ""; return 0; }
    extract_image_tag "$file" "$service"
}

# get_service_health_field <manifest-file> <service-key> <ready|live>
# ==============================================================================
# CRITICAL FEATURE (release-aware health checks, 2026-08): reads
# health.<service>.<ready|live> from manifest.yml. This is the mechanism
# that lets deploy.sh/rollback.sh stop hardcoding a static, version-unaware
# SERVICE_READINESS_URL map -- a real incident showed that assumption is
# false in general: a legitimately old release (predating a service's
# health module entirely) can never satisfy a URL a newer release invented
# after the fact. Every release now declares its OWN health endpoints (or
# doesn't) in its own manifest.yml, written once at packaging time (see
# deploy.yml's "Package Deployment Assets" step) -- deploy.sh/rollback.sh
# no longer need to know anything about endpoint paths/ports at all.
#
# Unlike extract_image_tag's single-level "svc: / tag:" structure, this is
# a 3-level nesting (health: -> <service>: -> ready:/live:), so a
# content-only state machine can't unambiguously tell "a sibling service
# under health:" apart from "an unrelated top-level section like images:"
# using the same key-equality trick extract_image_tag uses. This uses
# INDENTATION DEPTH instead (0 / 2 / 4), the same technique
# detect-changes.sh's ci/dependencies.yml parser already relies on for an
# equivalently-nested structure -- safe here because manifest.yml is
# entirely generated by one heredoc in one place with fixed, consistent
# indentation, never hand-edited.
#
# Backwards compatible by construction, not by special-casing: an old
# manifest with no `health:` block at all, a release that has `health:`
# but no entry for THIS service, or a service entry missing THIS specific
# field, all simply produce no match -- the awk program falls through with
# no output and exit code 0. This function NEVER fails and NEVER exits
# non-zero; the empty string is the deliberate, documented "not defined"
# signal callers check for (see deploy.sh/rollback.sh's readiness-map
# construction), not an error condition.
get_service_health_field() {
    local file="$1"
    local service="$2"
    local field="$3"   # "ready" or "live"
    [ -f "$file" ] || return 0
    awk -v svc="${service}:" -v fld="${field}:" '
        {
            line = $0
            sub(/\r$/, "", line)
            match(line, /^[ ]*/)
            indent = RLENGTH
            content = line
            sub(/^[ ]*/, "", content)
        }
        # Indentation is tracked RELATIVE to wherever "health:" itself
        # happens to sit (base_indent), never against an assumed absolute
        # column -- manifest.yml is written inside a `run: |` heredoc in
        # deploy.yml, so its actual on-disk baseline indent is whatever
        # that heredocs own nesting happens to be (10 spaces at the time
        # of writing this, not 0), matching the same "generated file, not
        # hand-authored, so its literal indentation is a byproduct of the
        # workflow file" caveat extract_release_short_sha documents above.
        !found_health && content == "health:" {
            found_health = 1
            base_indent = indent
            next
        }
        found_health && indent <= base_indent && content != "health:" {
            # Dedent back to (or past) the health: key own level -- the
            # health: block has ended (e.g. we reached a sibling top-level
            # key like "images:"). Stop matching for good.
            found_health = 0
            in_target = 0
            next
        }
        found_health && indent == base_indent + 2 {
            in_target = (content == svc)
            next
        }
        found_health && in_target && indent == base_indent + 4 && content ~ ("^" fld) {
            val = content
            sub("^" fld, "", val)
            gsub(/^[ \t"]+|[ \t"]+$/, "", val)
            print val
            exit
        }
    ' "$file"
}

# get_service_ready_url / get_service_live_url <manifest-file> <service-key>
# Thin, self-documenting wrappers around get_service_health_field() -- the
# names deploy.sh/rollback.sh actually call. Empty output (never a nonzero
# exit) means "this release does not define this endpoint" -- callers must
# treat that as "fall back to container-state-only verification", never as
# an error, and never invent a URL to fill the gap.
get_service_ready_url() { get_service_health_field "$1" "$2" "ready"; }
get_service_live_url()  { get_service_health_field "$1" "$2" "live"; }
