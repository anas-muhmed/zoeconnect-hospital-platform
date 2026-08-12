# Architecture Conformance Checks (CI)

These checks catch architectural drift automatically, so review discipline (`docs/architecture/adr/README.md`'s PR checklist) isn't the only line of defense. They complement, not replace, human review — a check passing does not mean an ADR wasn't violated in spirit, only that it wasn't violated in one of these specific mechanical ways.

Introduced incrementally starting with Milestone 1's CI baseline (`ci-backend.yml`/`ci-frontend.yml`, per `MILESTONE_PLAN.md`) and hardened through Milestone 7 (Phase 6 §3's CI/CD plan). Not all checks need to exist from day one — each is tagged below with the earliest milestone it should land in.

## Checks

| # | Check | Enforces | Earliest milestone | Mechanism (proposed) |
|---|-------|----------|---------------------|------------------------|
| 1 | **No module bypasses the Document Platform** | ADR-002, ADR-015 — `dynamic-forms` (and any future Application module) must call `document-platform` services for versioning/workflow/notifications/etc., never reimplement them | Milestone 5 (first real workflow/versioning logic exists to check) | Static analysis rule (e.g. dependency-cruiser or a custom ESLint rule) flagging any entity/repository/service pattern inside `dynamic-forms` that duplicates a `document-platform` responsibility (e.g. a second "publish" state machine) |
| 2 | **No controller exceeds an agreed complexity threshold** | ADR-015 / Phase 4B §1 — controllers stay thin, business logic lives in application services | Milestone 3 (first controllers exist) | Cyclomatic complexity lint rule scoped to `*.controller.ts` files, threshold TBD from real Milestone 3 controllers (calibrate on real code, not a guessed number) |
| 3 | **No imports violate package boundaries** | ADR-004 — `packages/canvas-engine` must have zero React/DOM imports; `packages/form-schema` must not import from `dynamic-forms` | Milestone 1 (packages exist from day one) | ESLint `no-restricted-imports` / dependency-cruiser rules per package, run in `ci-backend.yml`/`ci-frontend.yml` |
| 4 | **Circular dependency detection** | General maintainability, protects the layering in ADR-001/003/004 | Milestone 1 | `madge --circular` (or dependency-cruiser's circular rule) across both `backend/src` and `packages/*`, run in CI, zero tolerance |
| 5 | **Dependency graph validation** | ADR-002 — `document-platform` must never depend on `dynamic-forms` (the platform cannot depend on its own consumer) | Milestone 1 | dependency-cruiser rule asserting the allowed dependency direction: `dynamic-forms → document-platform`, never the reverse |
| 6 | **Schema migration coverage** *(carried over from Phase 6 §3, listed here for completeness)* | ADR-009 | Milestone 5 (first schema version bump) | CI fails if `CURRENT_SCHEMA_VERSION` changed without a corresponding registered `SchemaMigration` |
| 7 | **Plugin SDK compatibility** *(carried over from Phase 6 §3)* | ADR-006 | Milestone 7 (first real plugin) | `PluginCompatibilityService` run against all first-party plugins on every merge |
| 8 | **OpenAPI contract diff** *(carried over from Phase 5A §1.5 / Phase 6 §3)* | ADR-014 | Milestone 3 (first controllers/DTOs exist) | Diff generated OpenAPI spec against the previous merged spec; breaking change without a version bump fails the build |

## Adding a New Check

A new conformance check is itself a small process, not a free-for-all:

1. Name the ADR or architectural rule it enforces — a check with no ADR behind it is scope creep, not conformance.
2. Prefer a mechanical, low-false-positive check (import rules, dependency direction, generated-file diffs) over a fuzzy one (e.g., "does this look thin enough") that will just get disabled the first time it's inconvenient.
3. Land it in CI as a warning first if there's a real chance of false positives against existing code, then promote to a hard failure once calibrated.
