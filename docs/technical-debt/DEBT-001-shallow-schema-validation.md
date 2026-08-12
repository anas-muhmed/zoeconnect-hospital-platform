# DEBT-001: Shallow FormSchema Validation in FormsDesignerService

- **Introduced in:** Milestone 3 (Basic Components)
- **Why it exists:** `FormsDesignerService.validateSchema()` calls `isFormSchema()` — a structural guard
  that checks `schemaVersion`, `formId`, and `pages` are present — rather than a full zod deep-validation
  of every `ComponentNode` shape, `RuleExpression` sub-tree, and `ValidationRule` array. Deferred
  because a meaningful `RuleExpression` validator needs the Rule Engine (Milestone 5, ADR-007/ADR-008)
  to have real semantics to validate against; building it now would mean redoing it when the Rule Engine
  lands. Building a partial validator for only the `ComponentNode` shape was considered but rejected
  as it would give false confidence — either the validator is full or it is declared as a structural guard.
- **What was deferred:** Full zod deep-validation of:
  - Every `ComponentNode.type` against registered `ComponentDefinition` ids
  - Every `ValidationRule` against the allowed rule `kind` set
  - Every `RuleExpression` node's op/operand structure (the closed expression-tree grammar, ADR-012)
  - Every `BindingRef.entity` against the known entity set
- **Estimated effort to resolve:** 1–2 days. The zod schema already exists in concept (the types in
  `form-schema.types.ts` fully describe the shape); writing the matching zod parse schemas and wiring
  them into `isFormSchema()` / a new `validateFormSchema()` export is mechanical work once the Rule
  Engine's expression semantics are stable.
- **Priority:** Medium — the structural guard prevents completely malformed payloads from entering the
  database; only cleverly malformed but type-conforming payloads would pass undetected.
- **Planned removal:** Milestone 5 (Enterprise Features), when the Rule Engine gives `RuleExpression`
  real semantics to validate against. The removal consists of: adding full zod schemas to
  `packages/form-schema`, replacing `isFormSchema()` with `parseFormSchema()` (which throws on invalid
  structure), and removing the docblock caveat in `FormsDesignerService`.
- **Related ADR/Phase section:** ADR-001 (Schema-First), ADR-012 (Security — closed expression trees),
  Phase 4A §9 (schema validation on ingest).
