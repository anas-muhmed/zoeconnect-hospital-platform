# Technical Debt Log

This directory tracks deliberate shortcuts taken during execution of `docs/architecture/MILESTONE_PLAN.md`. The rule: **a shortcut is allowed to hit a milestone deadline; it is not allowed to disappear.** Every entry here is a promise to come back, with enough context that "come back" is actually possible months later.

This log is distinct from the ADR amendment process (`docs/architecture/adr/README.md`): an ADR change means the *architecture* was wrong or incomplete. A technical debt entry means the architecture is right, but the current implementation of it is a deliberate, temporary compromise (e.g., a stubbed pipeline stage, a hardcoded config value that should be admin-configurable, a missing edge-case handler).

## When to Log an Entry

Log an entry whenever you:
- Stub out a pipeline stage or service method with a "TODO: replace before Milestone N" comment.
- Hardcode something the architecture says should be configurable/dynamic (e.g., a single default WorkflowDefinition when ADR-008 calls for configurability, acceptable to defer until a second workflow is actually needed).
- Skip a test category for a milestone's exit criterion with the intent to backfill it later.
- Take a performance shortcut that will need revisiting once a later wave/milestone increases scale or component count.

## Entry Format

Create one file per debt item: `docs/technical-debt/DEBT-NNN-short-slug.md`

```markdown
# DEBT-NNN: <short title>

- **Introduced in:** Milestone <N> (<milestone name>)
- **Why it exists:** <the deadline/scope pressure that made this the right short-term call>
- **What was deferred:** <specifically what's missing vs. the full architecture/ADR intent>
- **Estimated effort to resolve:** <rough sizing — hours/days/a sprint>
- **Priority:** Low | Medium | High | Blocking-for-Milestone-<N>
- **Planned removal:** <which milestone or trigger condition removes this debt>
- **Related ADR/Phase section:** <e.g. ADR-008, Phase 4A §3>
```

## Index

_(Update this table as entries are added — keep it short; the individual files hold the detail.)_

| ID | Title | Introduced | Priority | Planned Removal |
|----|-------|-----------|----------|---------------------|
| [DEBT-001](./DEBT-001-shallow-schema-validation.md) | Shallow FormSchema validation (`isFormSchema` structural guard only, not full zod deep-validation) | Milestone 3 | Medium | Milestone 5 (Rule Engine lands, gives RuleExpression semantics to validate against) |

## Review Cadence

The debt index should be reviewed at the start of every milestone kickoff — if an item's "Planned removal" milestone has arrived, either resolve it or explicitly re-prioritize it with a reason, never let it silently roll forward indefinitely.
