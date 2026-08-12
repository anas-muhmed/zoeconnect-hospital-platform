# ADR-001: Progress Reports Platform Foundation

**Status:** Accepted  
**Date:** 2026-07-02  
**Deciders:** Vignesh (Product), Engineering  
**Context:** HDSP EIC module — Progress Reports subsystem

---

## Context

The existing `EicProgressReport` / `EicDisciplineProgressSection` implementation is functionally correct but architecturally incomplete. Specific gaps identified:

1. **Ownership is implicit.** Section `therapistId` is set at *submission time* by whatever user happens to call the API — there is no pre-assignment at report initiation.
2. **State transitions are inline.** `submitSection` / `sign` contain ad-hoc `if`-checks with no formal state machine, making future workflow changes risky.
3. **Side-effects are direct calls.** There is no event bus; adding notifications or audit hooks requires modifying the service directly.
4. **Discipline assignment is missing as a domain.** The `activeDisciplines` JSONB on enrollment records *which* disciplines are active (clinical record) but not *who* is assigned to deliver them (operational record). These are different domains and must not be conflated.
5. **Sidebar Progress Reports page is a stub.** No role-differentiated work queue exists; the page is navigable but non-functional.

This ADR records all decisions made before Phase 1 implementation begins.

---

## Decision 1 — Discipline Assignment as a Separate Domain

### Decision
Create `EicEnrollmentDisciplineAssignment` as a new entity alongside (not replacing) the existing `activeDisciplines` JSONB on `EicTherapyEnrollment`.

### Rationale
- `activeDisciplines` is a **clinical record** — it tracks which therapy types the patient is enrolled in. It informs assessments, goals, and reports.
- `EicEnrollmentDisciplineAssignment` is an **operational record** — it tracks which therapist is responsible for delivering a specific discipline to a specific patient.
- Mixing these concerns would make it impossible to answer "who was the OT for this patient during Q1?" without corrupting the clinical enrollment record.
- The assignment entity is reusable: sessions, scheduling, and caseload analytics all derive from it.

### Rejected Alternative
Replace `activeDisciplines` JSONB with a join table. Rejected because it would require a migration touching all existing enrollment records and break the existing assessment/goal/session APIs that read `activeDisciplines` directly.

### Entity Schema
```
EicEnrollmentDisciplineAssignment
  id                 uuid PK
  enrollment_id      uuid FK → eic_therapy_enrollments.id
  discipline         enum EicDiscipline
  therapist_id       uuid FK → users.id  (live reference, no name snapshot)
  role               enum (PRIMARY | COVERING | SUPERVISOR)
  assignment_reason  varchar(500) nullable
  effective_from     date NOT NULL
  effective_to       date nullable         (null = currently active)
  is_active          boolean DEFAULT true
  assigned_by        uuid FK → users.id
  version            integer DEFAULT 1     (monotonic counter, increment on reassignment)
  created_at         timestamptz
  updated_at         timestamptz
```

### Name Snapshot Policy
- **No name snapshots on assignments.** User records get `status: INACTIVE` instead of deletion.
- Names are snapshotted only at the moment of section submission (`submitted_by_name`) and report signing (`signatory_name`). These are point-in-time attestations, not mutable references.

---

## Decision 2 — Ownership Pre-Population at Report Initiation

### Decision
When `initiateReport()` is called, query the active PRIMARY `EicEnrollmentDisciplineAssignment` for each discipline being included in the report. Use that assignment's `therapist_id` to pre-populate `section.therapistId` at creation time.

### Rationale
- Ownership must be a first-class concept, not inferred from audit logs or submission actors.
- `assigned_to` and `updated_by` are semantically different. A Centre Head submitting on behalf of an absent therapist should not become the section owner.
- Pre-populating at initiation means the work queue can show "whose work is this?" immediately, before any section is touched.

### Fallback
If no active PRIMARY assignment exists for a discipline, `therapistId` remains `null` and the section is visible as "unassigned" in the Centre Head work queue (Phase 2 feature).

---

## Decision 3 — WorkflowPolicy Strategy Pattern

### Decision
Extract all state-transition logic into a `WorkflowPolicy` interface with a concrete `EicProgressReportPolicy` implementation. The service calls the policy; the policy decides legality.

### Interface
```typescript
export interface WorkflowPolicy<TStatus, TEvent> {
  canTransition(currentStatus: TStatus, event: TEvent): boolean;
  nextState(currentStatus: TStatus, event: TEvent): TStatus;
  guardMessage(currentStatus: TStatus, event: TEvent): string;
}
```

### Phase 1 State Machine (EicProgressReportPolicy)
```
IN_PROGRESS ──[ALL_SECTIONS_SUBMITTED]──▶ PENDING_SIGNATURE
PENDING_SIGNATURE ──[SIGNED]──▶ SIGNED
```
- `PUBLISHED` and `AMENDMENT_REQUESTED` are valid enum values but are not wired in Phase 1. Any attempt to transition to them throws `NotImplementedException`.
- The policy is injected as a provider, making it swappable (per-centre workflow configuration in Phase 3).

### Rejected Alternative
Keep inline `if`-checks. Rejected because adding AMENDMENT_REQUESTED in Phase 3 would require touching the service body, risking regression in existing transitions.

---

## Decision 4 — Domain Events via EventEmitter2

### Decision
Use `@nestjs/event-emitter` (EventEmitter2) for intra-process domain events. The progress report service emits events; downstream consumers (notifications, audit, analytics) subscribe.

### Events (Phase 1)
```typescript
ReportCreatedEvent        // fired after initiate()
SectionSubmittedEvent     // fired after each submitSection()
ReportReadyForSignatureEvent  // fired when all sections submitted → status → PENDING_SIGNATURE
ReportSignedEvent         // fired after sign()
```

### Event Payload (all events carry)
```typescript
{
  reportId:     string;
  enrollmentId: string;
  patientId:    string;
  actorId:      string;
  occurredAt:   Date;
}
```

### Rationale
- EventEmitter2 is in-process with zero infrastructure overhead. Correct choice for Phase 1.
- Loose coupling: notification service subscribes to `ReportReadyForSignatureEvent` without the progress-report service knowing it exists.
- Upgrade path to a message broker (BullMQ, Redis Streams) in Phase 3 without touching emitting code.

### Rejected Alternatives
- **Direct notification call in service:** Creates a circular dependency risk and violates SRP.
- **HTTP webhook:** Over-engineered for intra-monolith communication.

---

## Decision 5 — Phase Gating

### Decision
Implement only what is needed for Phase 1. Enum values for future states exist in the codebase but are not wired.

| State / Feature              | Phase 1 | Phase 2 | Phase 3 |
|------------------------------|---------|---------|---------|
| IN_PROGRESS                  | ✅      |         |         |
| PENDING_SIGNATURE            | ✅      |         |         |
| SIGNED                       | ✅      |         |         |
| PUBLISHED                    |         |         | ✅      |
| AMENDMENT_REQUESTED          |         |         | ✅      |
| Centre Head work queue       |         | ✅      |         |
| Cross-enrollment endpoint    |         | ✅      |         |
| Caseload analytics           |         |         | ✅      |
| Configurable workflow/policy |         |         | ✅      |

---

## Decision 6 — Due Dates (Two-Tier)

### Decision
Add two date columns to `EicProgressReport`:
- `sections_due_date` — deadline for therapists to submit their sections
- `report_due_date` — deadline for Centre Head to obtain signature

Both are nullable in Phase 1 (no enforcement logic yet). The columns exist so Phase 2 can add enforcement and reminder events without a schema change.

---

## Decision 7 — Sidebar Work Queue (Deferred to Phase 2)

### Decision
The existing Progress Reports sidebar page remains a stub in Phase 1. No UI changes to the sidebar or work queue page are in scope for this phase.

Phase 2 will implement role-differentiated views:
- **Therapist:** "My Caseload" — sections assigned to me
- **Centre Head:** Work queue of reports awaiting action
- **Admin:** Global management across branches

---

## Consequences

### Positive
- Clear separation of clinical (`activeDisciplines`) and operational (assignment entity) data
- State machine is auditable, testable, and swappable
- Notification service can subscribe without modifying the core service
- Pre-populated ownership enables work queue queries in Phase 2
- Phase-gated: Phase 1 is shippable without Phase 2/3 being complete

### Negative / Trade-offs
- Additional entity and migration complexity in Phase 1
- EventEmitter2 is in-process only — if the monolith splits, events become invisible across services (acceptable risk for current scale)
- `sections_due_date` / `report_due_date` are nullable with no enforcement in Phase 1 (deliberate, documented)

---

## Related Files

| File | Role |
|------|------|
| `backend/src/modules/eic/entities/eic-enrollment-discipline-assignment.entity.ts` | New entity (Phase 1) |
| `backend/src/modules/eic/progress-report/workflow-policy.interface.ts` | New interface (Phase 1) |
| `backend/src/modules/eic/progress-report/eic-progress-report.policy.ts` | New policy impl (Phase 1) |
| `backend/src/modules/eic/progress-report/report.events.ts` | New events (Phase 1) |
| `backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.service.ts` | New service (Phase 1) |
| `backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.controller.ts` | New controller (Phase 1) |
| `backend/src/modules/eic/progress-report/eic-progress-report.service.ts` | Modified (Phase 1) |
| `backend/src/modules/eic/eic.module.ts` | Modified (Phase 1) |
| `backend/src/database/data-source.ts` | Modified — add migration (Phase 1) |
| `backend/src/database/migrations/1751400000005-AddDisciplineAssignments.ts` | New migration (Phase 1) |
