# Architecture Decision Records

This directory contains the individual ADRs that make up the frozen architectural constitution for **HDSP Healthcare Document Studio** (Dynamic Patient Forms is the first application built on this platform). A consolidated, formatted version of all 15 ADRs is also kept at `ADR-CONSOLIDATED.docx` in this folder.

## Index

- [ADR-001: Schema-First Architecture](./ADR-001.md)
- [ADR-002: Document Platform Abstraction (Form as One Document Type)](./ADR-002.md)
- [ADR-003: Builder / Renderer Separation](./ADR-003.md)
- [ADR-004: Framework-Agnostic Canvas Engine](./ADR-004.md)
- [ADR-005: Component Registry](./ADR-005.md)
- [ADR-006: Plugin SDK](./ADR-006.md)
- [ADR-007: Six-Stage Rendering Pipeline](./ADR-007.md)
- [ADR-008: Configurable Workflow Engine](./ADR-008.md)
- [ADR-009: Explicit Schema Migration Strategy](./ADR-009.md)
- [ADR-010: Component Deprecation Policy](./ADR-010.md)
- [ADR-011: Multi-Branch/Department Inheritance Model](./ADR-011.md)
- [ADR-012: Security Model — RBAC, Audit, and Server-Side Re-Validation](./ADR-012.md)
- [ADR-013: Performance Budgets](./ADR-013.md)
- [ADR-014: API Versioning and Compatibility Contract](./ADR-014.md)
- [ADR-015: Platform Boundaries — Designer API vs. Runtime API, dynamic-forms as Consumer](./ADR-015.md)

## Amendment Process

These ADRs are frozen as of the Phase 1–6 roadmap approval (2026-07-05). To change one:

1. Identify the specific ADR(s) affected and the concrete implementation issue that reveals a genuine flaw — architectural taste alone does not justify a change once the roadmap is approved.
2. Draft a superseding ADR (e.g. `ADR-016.md`) stating what changes, why the original decision no longer holds, and the migration impact on anything already built against it.
3. Get the superseding ADR explicitly approved before implementation deviates from the original decision — no silent erosion via a "just this once" shortcut in code.

Superseded ADRs move to `../decisions/superseded/`; proposals considered and explicitly rejected (not just superseded) live in `../decisions/rejected/` with the reasoning kept for future reference.

## PR Review Checklist

For every pull request touching this platform, reviewers should be able to answer:

- Does this violate any ADR?
- Does it introduce a new architectural decision?
- If yes, is there a new ADR?
- If no, why is the implementation still consistent with the architecture?
