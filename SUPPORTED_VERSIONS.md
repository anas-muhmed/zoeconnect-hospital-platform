# HDSP Supported Version Window

Phase 12 (Hybrid Architecture roadmap, Task 12.6). Applies primarily to
**self-hosted** deployments, where — unlike cloud, which always runs the one
version the operating team deployed — a hospital's own upgrade cadence
determines which release they're running at any given time.

## Policy: N-2

At any point in time, the three most recent MINOR release lines of
`hdsp-backend` are supported: the current line (**N**) and the two before it
(**N-1**, **N-2**). A release line stops receiving patches/security fixes
once a new line two versions ahead of it ships (i.e. when N+1 ships, N-2
becomes unsupported).

Example: if `1.4.x` is current, `1.3.x` and `1.2.x` are still supported;
`1.1.x` and earlier are not.

**What "supported" means concretely:**
- Security fixes and critical bug fixes are backported to all three lines.
- `check-compatibility.js`/`COMPATIBILITY.json` (Task 12.5) continues to
  list a compatible Connector range for all three lines.
- New feature work targets the current line (N) only — this is a
  bugfix/security window, not a feature-parity guarantee across lines.

**What happens outside the window:** an installation on an unsupported line
receives no further patches. `install.sh` does not refuse to run against an
unsupported version (no phone-home version check exists, deliberately —
self-hosted installs are not required to report their version anywhere),
but `PHASE_12_IMPLEMENTATION_PLAN.md`'s release-notes template flags each
release's minimum-supported-line in its own text, and the admin UI's
version display (not yet built — see below) is the natural place to
eventually surface an in-app "your version is no longer supported" notice.

## Why N-2, not a longer or shorter window

- Shorter (N only) would force every hospital onto a near-continuous
  upgrade cadence for a system running production patient/billing
  workflows — unrealistic given DEPLOY.md's manual runbook is still the
  documented fallback and not every hospital IT team can move fast.
- Longer (N-4, N-5) would mean maintaining backport branches for release
  lines old enough to predate significant architecture (e.g. anything
  before this hybrid migration's Phase 8 multi-tenancy activation) —
  disproportionate maintenance cost for a self-hosted-only, no-telemetry
  product where actual install-base version distribution isn't known.
- N-2 is a starting policy, not a permanent one — revisit once there's
  real self-hosted install-base data to base the window on instead of a
  reasonable-sounding default.

## Release notes process

Every tagged release (`build-images.yml`'s `is_release==true` path) should
have accompanying release notes covering: what changed, any migration
notes (new required env vars, breaking config changes), the Connector
compatibility range from `COMPATIBILITY.json`, and whether this release
starts or ends any line's place in the N-2 window. No automated release-notes
generation exists yet (e.g. from conventional commits or PR titles) — this
is a manual step for whoever cuts the tag, tracked as a natural follow-up
once release cadence is established enough to justify automating it.

## Explicitly out of scope for this phase

Per this project's standing "Phase 12 is CI/CD and release packaging, not
monitoring/observability/scaling" boundary (recorded in
`PHASE_12_IMPLEMENTATION_PLAN.md`): this document does not cover uptime
SLAs, incident response, or telemetry/usage tracking to actually measure
the self-hosted install-base's version distribution — none of that exists
today, and building it is a distinct, larger effort than a version-window
policy document.
