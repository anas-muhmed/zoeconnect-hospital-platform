# HDSP Healthcare Document Studio — Implementation Milestone Plan

**Status: EXECUTION MODE.** Planning is complete (Phase 1–6 architecture roadmap approved and frozen, 2026-07-05, see `docs/architecture/adr/`). This document tracks **execution**, not further architecture — no milestone below should require a new architectural decision; if one seems to, stop and draft a superseding ADR first (see `docs/architecture/adr/README.md`).

## Execution Mode Rules

1. **No more architecture phases.** The architecture is frozen. A decision may only be revisited if: (a) an implementation blocker is discovered, (b) a measurable performance issue appears, or (c) a genuine integration requirement invalidates an ADR. Otherwise, build against the existing decisions — do not improvise around them.
2. **Every milestone ends with a release candidate**, not a documentation checkpoint. Each milestone's exit criterion below is framed as a working, demoable artifact (see "Release Candidate" line per milestone).
3. **Technical debt is tracked explicitly**, not left implicit in code. Every shortcut taken to hit a milestone is logged in `docs/technical-debt/` (why it exists, which milestone introduced it, estimated effort, priority, planned removal) — see `docs/technical-debt/README.md`.
4. **Architecture conformance is enforced in CI**, not just at code review. See `docs/architecture/CONFORMANCE_CHECKS.md` for the specific automated checks (package boundary violations, Document Platform bypass detection, circular dependency detection, controller complexity thresholds) to be added starting Milestone 1's CI baseline and hardened through Milestone 7.

Each milestone lists its goal, scope, explicit non-goals (to prevent scope creep pulling forward later-milestone work), the ADRs/phase sections it implements, its release-candidate artifact, and its exit criterion.

---

## Milestone 1 — Platform Foundation (2–3 weeks)

**Goal:** Nothing user-facing yet. Prove the platform's structural skeleton compiles, migrates, and boots.

**Scope**
- Create `packages/canvas-engine`, `packages/canvas-engine-react`, `packages/form-schema` package structure (ADR-004).
- PostgreSQL migrations for the generic Document Engine schema: `documents`, `document_versions`, `document_overrides`, `document_instances`, `document_signatures`, `document_field_audit` (Phase 4A §2.2).
- Document Engine service skeleton (CRUD + version create, no publish workflow yet).
- Component Registry skeleton (empty registry, registration mechanics only — no real components).
- Plugin SDK interfaces (`FormBuilderPlugin`, `sdkVersion` contract) with zero real plugins.
- CI/CD baseline: `ci-backend.yml`, `ci-frontend.yml` (lint, typecheck, unit tests only — no E2E yet).

**Non-goals:** No UI beyond smoke tests. No workflow engine, no notifications, no canvas rendering.

**Implements:** ADR-001, ADR-002, ADR-004, ADR-005 (skeleton), ADR-006 (interfaces only).

**Release Candidate:** Project boots, migrations run cleanly, Document Engine skeleton works.

**Exit criterion:** `npm run migration:run` succeeds against a clean database; a synthetic "test" document type (Phase 4A §10.1) can be created, versioned, and fetched via service-layer calls in an integration test — no controllers required yet.

---

## Milestone 2 — Canvas Core

**Goal:** A usable, empty designer surface — proves the engine, not the product.

**Scope**
- Infinite canvas: pan, zoom, fit-to-page.
- Selection (marquee, multi-select), grid + snap-to-grid.
- Command system: `Command`, `CommandHistory`, undo/redo.
- One test-only component (a plain Rectangle) to prove the render loop — not a real form component.

**Non-goals:** No real form components. No property panel beyond a bare position/size readout. No server persistence beyond a manual save button.

**Implements:** ADR-004, ADR-007 (partial — Renderer stage only, no Resolver/Rule/Permission/Theme stages yet since there's no real content to resolve).

**Release Candidate:** Canvas is usable — pan/zoom/select/undo/redo work interactively, even with no real form components yet.

**Exit criterion:** A designer can draw, move, resize, delete, undo, and redo a rectangle at 60fps with 500+ rectangles on screen (informal precursor to the Phase 5A §10 performance test, which formalizes this budget in Milestone 7).

---

## Milestone 3 — Basic Components

**Goal:** First real end-to-end slice: **Design → Save → Reload → Render**.

**Scope**
- Wave 1 components (Phase 5B §4): Label, Textbox, TextArea, Checkbox, Radio, Dropdown.
- Component Registry entries with real `propertySchema` (Inspector Architecture, Phase 5B §2) — the generic Inspector Generator is built here, proven against these six components.
- FormSchema serialize/deserialize round-trip (ADR-001) wired to the Document Engine skeleton from Milestone 1.
- Designer-API namespace (`/forms/designer/...`, ADR-015) for template CRUD (draft only, no publish yet).

**Non-goals:** No workflow/publish, no runtime fill experience yet, no rules/variables, no PDF.

**Implements:** ADR-001, ADR-003 (Builder side only), ADR-004, ADR-005, ADR-014 (versioning/idempotency conventions established here, not retrofitted later).

**Release Candidate:** First end-to-end form works — Design → Save → Reload → Render on real (if basic) components.

**Exit criterion:** A designer builds a simple form with all six Wave 1 components, saves it, reloads the page, and sees the identical schema restored — verified by an automated round-trip test, not just visual inspection.

---

## Milestone 4 — Runtime

**Goal:** The other half of Builder/Renderer separation (ADR-003) — a real fill experience.

**Scope**
- JSON Renderer: mounts `RendererComponent`s from the Component Registry against a resolved schema.
- Validation (required/regex/range — the basic validation kinds needed by Wave 1 components).
- Submission: create/save/finalize a `document_instances` row.
- Autosave (client-side debounce) and drafts.
- PDF generation for a simple filled Wave-1-only form (Document Engine's generic `pdfRenderer`, Phase 4A §2.1).
- Runtime-API namespace (`/forms/runtime/...`, ADR-015).

**Non-goals:** No signatures yet (Wave 5). No rules/variables (Milestone 5). No branch overrides yet.

**Implements:** ADR-003, ADR-007 (Renderer stage fully exercised; Resolver/Layout/Rule/Permission/Theme stages stubbed as pass-through until their real content arrives in later milestones), ADR-012 (server-side re-validation on finalize, from day one — not retrofitted).

**Release Candidate:** First clinician can complete and submit a form, end to end, with a PDF to show for it.

**Exit criterion:** A clinician-role test user fills a Wave-1-only published form, submits it, and a PDF matching the on-screen layout is generated — full Builder→Runtime→PDF loop proven on the simplest possible content.

---

## Milestone 5 — Enterprise Features

**Goal:** The features that make this a real clinical form platform, not a generic web form tool.

**Scope**
- Wave 2 (Container, Section, Card, Columns, Tabs, Accordion) and Wave 3 (Tables, Repeat Sections, Variables, Rules) components.
- Rule Engine and Variables Engine (Phase 2 §5.3, Phase 3 §8) fully wired through the Rule/Permission stages of the pipeline (ADR-007) — this is where those pipeline stages stop being pass-throughs.
- Configurable Workflow Engine (ADR-008): the default 6-state flow goes live (Draft→In Review→Approved→Published→Archived→Retired).
- Publishing, versioning, rollback, version compare (Phase 1 §4.5).
- Branch/Department Overrides (ADR-011) and the Resolver stage goes live.
- Notification Engine (Phase 4A §4) wired to workflow transitions.

**Non-goals:** No medical components yet (Milestone 6). No plugin activation yet beyond the interfaces from Milestone 1.

**Implements:** ADR-007 (all stages now live), ADR-008, ADR-009 (first real schema version bump exercises the migration engine), ADR-011.

**Release Candidate:** Enterprise workflows are operational — real approval chains, branch overrides, and notifications work, not just single-user drafting.

**Exit criterion:** The Patient Registration and Patient Consent reference templates (Phase 1's two simpler v1 templates) are fully buildable, publishable with a real approval chain, override-able per branch, and fillable/submittable end-to-end.

---

## Milestone 6 — Medical Components

**Goal:** Prove the hardest component category and validate the full v1 template set.

**Scope**
- Wave 4 components: Body Diagram, Dental Chart, Burn Assessment, generic SVG Annotation/Drawing Layer.
- Custom Inspector escape hatch (Phase 5B §2.3) exercised for the first time (hotspot/region editors).
- Asset Library (Phase 3 §7) goes live to back the underlying SVG diagrams.
- The Nursing Assessment reference template (Phase 1's benchmark template) built and validated against every engine capability per the Phase 2 §9 traceability matrix.

**Non-goals:** Signatures, PDF-from-signed-document, and Plugin activation are Milestone 7 (Wave 5), not this milestone.

**Implements:** ADR-005 (custom-control escape hatch), ADR-011 (department-level override exercised via a department-specific vitals set, per Phase 2 §9).

**Release Candidate:** Clinical templates are usable — the hardest reference template (Nursing Assessment) works end-to-end, not just simplified administrative forms.

**Exit criterion:** The Nursing Assessment template — tables, repeat sections, dynamic sections, conditional logic, body diagram, pain assessment, vital charts, calculated fields — is fully designable, publishable, and fillable.

---

## Milestone 7 — Production Readiness

**Goal:** Execute Phase 6 in full. This is where the platform becomes deployable to a real hospital, not just demoable.

**Scope**
- Wave 5 components: Signature (ADR-012's server-side re-validation extended to signature capture), PDF Preview, Plugin activation (first real plugin inst