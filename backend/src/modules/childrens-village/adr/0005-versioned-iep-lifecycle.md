# 5. Versioned IEP Lifecycle

Date: 2026-08-02
Status: Accepted

## Context
Individual Education Plans (IEPs) are legally and medically sensitive documents. In-place updates destroy historical context, which is unacceptable for special education auditing.

## Decision
We implemented a strict versioned lifecycle. 
- State machine: `DRAFT` → `UNDER_REVIEW` → `APPROVED` → `ACTIVE` → `REVIEW_DUE` → `ARCHIVED`.
- IEPs are immutable once approved. Updates require a new version (or formal review logging on goals).

## Consequences
- **Positive**: Full auditability and historical tracking of student progress year-over-year.
- **Positive**: Safe for legal compliance.
- **Negative**: Increased database footprint due to version duplication.
