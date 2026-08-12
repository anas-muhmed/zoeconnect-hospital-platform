# Children's Village — Timetable Management & Approval Workflow
## Enterprise Solution Design Specification

**Prepared for:** Children's Village Module Engineering
**Author role:** Lead Enterprise Solution Architect
**Date:** August 3, 2026
**Status:** Draft for review — no implementation until sign-off

---

## 0. Current-State Findings (Codebase Grounding)

This design is not greenfield. A `timetables` sub-module already exists at `backend/src/modules/childrens-village/timetables/` and must be extended, not replaced. Current state, confirmed by direct code inspection:

**What exists today.** `CvTimetable` (one row per class/academic-year/term, `isActive` flag only — no draft/published states). `CvTimetablePeriod` (day-of-week + start/end time + subject + teacher + room, as a flat recurring template — no version number, no effective-date range). `CvTimetablePeriodOverride` (a single-date override of one field on one period — the mechanism the current UI uses for "move this one class today"). `CvStudentScheduleOverride` (per-student pull-outs for therapy/medical, already modeling the "student-specific exceptions" requirement in a basic form). `CvSettings` (one row per tenant, currently holding only `requireAdmissionApproval` — the natural home for new timetable/approval configuration). `CvClass.classTeacherId` (a single homeroom-teacher FK; there is no subject-teacher assignment table — subject teachers today are implicit, inferred only from whichever `teacherId` appears on a `CvTimetablePeriod`).

**What does not exist and must be designed.** No `CvTeacher` entity — teacher identity is an unenforced `uuid` presumed to reference the platform `User`; there is also no typed relation from `CvTimetablePeriod.teacherId` to `User`. No timetable controller at all — the only consumer of `CvTimetableService` is the teacher-workspace controller, and it exposes just three narrow, ownership-gated routes with no RBAC permission strings. No draft/review/approval/published/archived lifecycle — `isActive` is the only status concept. No versioning — edits mutate the template row in place (`updatePeriod` with `scope: 'ALL_FUTURE'`), so history is lost. No conflict detection whatsoever — `addPeriod`/`updatePeriod` perform no check for teacher, room, or class double-booking; there are no indexes that would even support one efficiently. No approval engine local to Children's Village — but a full generic workflow engine already exists in `document-platform/workflow-engine/` (`WorkflowTemplate` → `WorkflowInstance` → `WorkflowTask`, with declarative JSONB definitions, role/department/user assignment, SLA and escalation fields) that this module should integrate with rather than reinvent. A separate, much lighter admission-approval pattern already exists in CV itself (`cv_settings.requireAdmissionApproval` gating a single approve/reject action) — useful as a precedent for "toggle a workflow on per tenant" but not a state machine. RBAC uses two guards in combination (`@Roles` for coarse role checks, `@RequirePermissions('MODULE:RESOURCE:ACTION')` for fine-grained checks) plus a third `LicenseGuard`/`@RequireModule('CHILDRENS_VILLAGE')` layer; only `SUPER_ADMIN`/`HOSPITAL_ADMIN` are confirmed as seeded role names — Principal, Head Teacher, and Teacher are not confirmed to exist as fixed roles today and may need to be introduced as CV-specific roles or as permission bundles. A generic, queue-based `NotificationService` and a generic `AuditService` (Bull-queued writes to `audit_logs`, fields `userId/tenantId/action/module/entityType/entityId/oldValue/newValue/metadata`) already exist and should be the delivery mechanisms for this module's notification and audit requirements — no new audit or notification infrastructure is needed, only correct usage.

**Implication for this design.** Everything below is scoped as an *additive* extension: new tables and columns alongside the existing four timetable entities (not a rewrite), a new `CvTimetableController` (currently missing), integration with the existing `workflow-engine` module for approvals rather than a bespoke state machine, a new `CvTeacher`-adjacent join table for subject-teacher assignment, and reuse of the existing `NotificationService`/`AuditService`/`PermissionsGuard` rather than parallel systems.

---

## 1. Functional Specification

### 1.1 Scope

The Timetable Management module governs the full lifecycle of a class's weekly schedule: authoring, review, approval, publication, day-to-day operation (including exceptions, absences, exchanges, and substitutions), versioning, and archival — for every class, section, subject, teacher, and resource inside a tenant's Children's Village deployment, across academic years.

### 1.2 Core entities in scope

Timetable (a versioned, class-scoped weekly template), Timetable Period (a single day/time/subject/teacher/room slot within a timetable version), Teacher Assignment (which teachers — main and subject — are eligible to teach which class/subject combinations), Approval Configuration (per-tenant, configurable approval chain definition), Approval Instance (a specific approval run against a specific timetable version or change request), Teacher Availability Record (absence, leave, training, meeting, hospital visit, therapy session, off-site assignment), Period Exchange Request (one-off, single-period reassignment), Period Swap Request (mutual exchange between two teachers), Substitute Assignment (temporary coverage of one or more periods by a non-regular teacher), Resource Booking (room/lab/therapy-space reservation tied to a period), Special Day (calendar-level override affecting all timetables on a date or date range), Student Schedule Exception (a named student's recurring or one-off pull-out), Lesson Completion Record (post-hoc status of a delivered period), and the supporting Notification, Audit, and Report projections described in later sections.

### 1.3 Functional requirements beyond the brief (discovered scope)

Several scenarios are implied by the brief but not explicitly stated, and must be designed for:

*Multi-section and multi-class teacher load.* A subject teacher commonly teaches the same subject across several sections or classes in a single day. Timetable authoring and conflict detection must reason about a teacher's *entire* schedule across all classes, not just one class's timetable in isolation — otherwise cross-class double-booking is invisible.

*Timetable existing without a class teacher assigned yet.* Classes may be created before a Main Class Teacher is assigned (new academic year, transfers pending). The system must allow draft timetable authoring to proceed and simply block Publication (or block the class-teacher approval step specifically) until the role is filled, rather than blocking creation entirely.

*Partial-week publication.* A school may need Monday–Wednesday finalized and approved while Thursday–Friday is still under negotiation (e.g., a pending teacher transfer). The state machine must support per-day or per-period approval granularity, not only whole-timetable-version granularity — addressed via "partial publication" in section 12 and the versioning model in section 3.

*Two academic years overlapping during transition.* At year-end, next year's draft timetable is authored while the current year's timetable is still Active. The system must let both coexist without one's approval workflow blocking the other, keyed by `academicYearId`/`termId`.

*Teacher on multiple concurrent leave types.* A teacher can be simultaneously "on approved leave" (HR system) and have a "training" calendar entry (professional development) that only partially overlaps a teaching day. Availability must be modeled as a set of time-ranged records with a type and severity (hard-block vs. soft-warn), not a single boolean.

*Approval chain deadlock when an approver is also the requester.* If a Main Class Teacher initiates a change and is also configured as the first approver, the engine must auto-skip that step (or the Approval Configuration must forbid the requester from being an approver on their own request) — this is an explicit edge case, not an oversight to patch later.

*Retroactive correction after a lesson was already marked "Substituted" but the substitute later becomes unavailable too.* This is a real operational occurrence (a domino chain of absences) and must be supported by allowing re-substitution without losing the audit chain of the first substitution.

*Cross-tenant / cross-hospital isolation of teacher availability.* Given the existing `tenantId`/`hospitalId` two-level scoping, a teacher's availability, swap requests, and notifications must never leak across tenant boundaries, including in aggregate reports.

---

## 2. Workflow Diagrams (Textual)

### 2.1 Timetable authoring → publication

```
[Class + Academic Year exists]
        |
        v
  DRAFT  ---------(edit periods, add subjects/teachers/rooms)-------> DRAFT
        |
        | submit for review
        v
  IN_REVIEW  ------(reviewer requests changes)-----> DRAFT
        |
        | reviewer approves review step (optional layer, see 2.2)
        v
  PENDING_APPROVAL -----> [Approval Engine — see Section 6] -----> APPROVED / REJECTED
        |                                                             |
        | (APPROVED)                                                 | (REJECTED)
        v                                                             v
  PUBLISHED (immutable, versioned)                              DRAFT (new edit cycle)
        |
        | effective date reached
        v
  ACTIVE (this is the version currently governing the class's live schedule)
        |
        | superseded by a new PUBLISHED version, OR term/year ends
        v
  ARCHIVED (retained, read-only, queryable for history/audit/rollback)
```

Additional lifecycle states beyond the brief's five are required: **IN_REVIEW** (a lightweight, optional pre-approval sanity pass — separable from formal Approval so schools that want "have the coordinator glance at it" without full sign-off can do so), **REJECTED** (a distinct terminal-per-attempt state, not a silent return to Draft, so the rejection reason and rejecting party are preserved for audit), **SUPERSEDED** (a version that was ACTIVE but has been replaced by a newer PUBLISHED version before its own natural end — distinct from ARCHIVED, which implies the term/year genuinely ended), and **SUSPENDED** (an emergency state — e.g., school closure or a major staffing crisis — where an ACTIVE timetable is temporarily deactivated without being replaced or archived, and automatically resumes or requires explicit reactivation).

### 2.2 Approval workflow (generic, N-level, configurable)

```
Change/New Timetable Version Ready
        |
        v
  Approval Configuration lookup (per tenant, per change type)
        |
        +-- DISABLED -----------------------------> auto-transition to PUBLISHED
        |
        +-- SINGLE / TWO-LEVEL / MULTI-LEVEL
                |
                v
        Step 1: Approver Role/User (e.g., Main Class Teacher)
                | approve            | reject               | timeout
                v                    v                       v
        Step 2 (if configured)   REJECTED (end)        Escalate per config
                | approve                                    |
                v                                             v
        Step N: final approver (e.g., Principal)      Escalate target approves/rejects
                | approve            | reject
                v                    v
        PUBLISHED               REJECTED (end, notify requester)
```

Each step is independently configurable for approver type (specific role, specific user, "any user with permission X"), SLA/timeout, reminder interval, escalation target, and whether it is skippable (auto-approve) under an Emergency Override.

### 2.3 Teacher-initiated period exchange (one-off, single period)

```
Teacher A: "cannot teach Period 3 tomorrow"
        |
        v
  A selects Period 3 + proposes Teacher B (system suggests eligible teachers:
  same subject qualification, no conflict at that slot, not on leave)
        |
        v
  Exchange Request created (status: PENDING_TEACHER_B)
        |
        v
  Notification -> Teacher B
        |
        +-- B declines --------------------------> status: DECLINED, notify A,
        |                                            A must pick another teacher
        |
        +-- B accepts
                |
                v
        status: PENDING_APPROVAL (if configured; else auto-continues)
                |
                v
        [Approval chain per config — Main Teacher / Head Teacher / Principal / Admin]
                |
                +-- rejected --> status: REJECTED, notify A and B, no change applied
                |
                +-- approved
                        |
                        v
                Conflict Engine re-validates B's slot at execution time
                (defends against races: B may have accepted something else meanwhile)
                        |
                        +-- new conflict found --> status: BLOCKED, notify both + admin
                        |
                        +-- clean
                                |
                                v
                        Apply as a THIS_DAY period override (existing
                        CvTimetablePeriodOverride mechanism, extended with
                        exchangedTeacherId + originalTeacherId + requestId)
                                |
                                v
                        status: COMPLETED. Notify A, B, class-affected students'
                        guardians (optional per config), original + new teacher's
                        calendars updated.
                                |
                                v
                        Audit: full chain (created, accepted, approved by whom,
                        applied, timestamps) retained permanently, linked to the
                        override row for rollback.
```

Rollback: any COMPLETED exchange can be reversed by an authorized role before the period's date passes (or within a configurable grace window after), which deletes/deactivates the override and restores the original `teacherId`, logged as `CV_TIMETABLE_EXCHANGE_ROLLED_BACK` with a mandatory reason.

### 2.4 Mutual period swap

Identical shape to 2.3 but bidirectional: both A's and B's periods change simultaneously, both must accept, and the Conflict Engine validates both slots atomically (both succeed or neither is applied — no partial swap). Approval chain, if configured, can require sign-off from both teachers' Main Class Teachers if the periods belong to different classes.

### 2.5 Substitute teacher assignment

```
Absence recorded (Teacher Availability Record: ABSENT/LEAVE/etc.)
        |
        v
  Conflict Engine flags all periods this teacher was scheduled to teach
  in the affected window (period / day / week / long-term)
        |
        v
  Admin/Head Teacher/Coordinator reviews flagged periods
        |
        v
  For each period (or bulk for the whole window):
      assign Substitute (search: subject-qualified, available, not
      already substituting elsewhere at that time)
        |
        v
  Approval (configurable — often auto-approved for short substitutions,
  required for long-term replacement per Approval Configuration keyed
  by substitutionDurationCategory: SINGLE_PERIOD / SINGLE_DAY / WEEK / LONG_TERM)
        |
        v
  Substitute Assignment record created, linked to original teacher +
  affected period(s)/override(s). Notifications to substitute, original
  teacher, class's Main Class Teacher, guardians (configurable).
        |
        v
  On expiry (end date reached) -> auto-revert to original teacher,
  or auto-transition to Permanent Change workflow if marked "convert
  to permanent" (e.g., long-term replacement becomes the new teacher of
  record, triggering Section 2.6).
```

### 2.6 Permanent timetable change (teacher leaves/joins, subject change, class merge/split)

```
Trigger event (HR: teacher exit/transfer; Academic: subject added/removed;
Structural: class merge/section split)
        |
        v
  Change Request created against the ACTIVE timetable, type-tagged
  (TEACHER_REPLACEMENT / SUBJECT_CHANGE / CLASS_MERGE / SECTION_SPLIT)
        |
        v
  System generates a DRAFT new version pre-populated from the current
  ACTIVE version with the change applied (e.g., all periods with
  outgoing teacherId reassigned to a placeholder or nominated replacement)
        |
        v
  Standard authoring -> review -> approval -> publish cycle (Section 2.1),
  with the Approval Configuration for this specific change TYPE potentially
  requiring a higher approval level than a routine draft edit (e.g., class
  merge always requires Principal + Administrator regardless of the
  tenant's default configuration)
        |
        v
  On publish: new version becomes ACTIVE at its effective date; prior
  version transitions to SUPERSEDED (not ARCHIVED, since the term/year
  hasn't ended); all affected teachers/students/guardians notified;
  historical version remains queryable.
```

For class merges/section splits specifically: the system must also handle re-pointing of `CvStudentScheduleOverride` and `CvTimetablePeriodOverride` rows tied to the old class/section — orphaned overrides are flagged for manual review rather than silently dropped or silently misapplied.

---

## 3. Database Design

All additions are new tables/columns alongside the existing `cv_timetables`, `cv_timetable_periods`, `cv_timetable_period_overrides`, `cv_student_schedule_overrides`, and `cv_settings` tables, following the established conventions (`uuid` PKs, `tenant_id NOT NULL` + `hospital_id` nullable on every table, `created_at`/`updated_at`, `created_by`/`updated_by` where mutable, TypeORM migrations under `backend/src/database/migrations/`).

**Modify `cv_timetables`** — add: `version integer NOT NULL DEFAULT 1`, `status varchar(20) NOT NULL DEFAULT 'DRAFT'` (DRAFT/IN_REVIEW/PENDING_APPROVAL/APPROVED/REJECTED/PUBLISHED/ACTIVE/SUPERSEDED/ARCHIVED/SUSPENDED), `parent_version_id uuid NULL` (self-FK, points to the version this was derived from), `effective_from date NULL`, `effective_to date NULL`, `published_at timestamp NULL`, `published_by uuid NULL`, `change_type varchar(30) NULL` (ROUTINE/TEACHER_REPLACEMENT/SUBJECT_CHANGE/CLASS_MERGE/SECTION_SPLIT/EMERGENCY), `superseded_by_id uuid NULL`. Unique constraint: only one `(class_id, academic_year_id, term_id)` row may have `status = 'ACTIVE'` at a time (enforced via partial unique index).

**Modify `cv_timetable_periods`** — add: `resource_id uuid NULL` (FK to new `cv_resources`, replacing/augmenting free-text `room`), `notes text NULL` (the brief's "optional notes" field, currently absent), `period_number integer NULL` (ordinal slot, for schools that schedule by period number rather than raw time), and two indexes the current schema lacks: a composite index on `(teacher_id, day_of_week, start_time, end_time, tenant_id)` and one on `(resource_id, day_of_week, start_time, end_time, tenant_id)`, both required for performant conflict detection (Section 3 note: today there are zero indexes on this table beyond the PK/FK).

**New `cv_class_subject_teachers`** — `id`, `tenant_id`, `hospital_id`, `class_id` FK, `subject_id` FK, `teacher_id` uuid, `is_primary boolean`, `academic_year_id` FK, `effective_from`/`effective_to`, `created_by`/`updated_by`, timestamps. Fills the confirmed gap: today there is no table declaring which teachers are eligible/assigned to a subject for a class — only inferred from period rows. This becomes the source of truth the Timetable Authoring UI uses to populate valid teacher choices and the Conflict Engine uses to flag unqualified assignments.

**New `cv_teacher_profiles`** (thin, additive — not a full HR entity, deliberately kept minimal to avoid duplicating an eventual platform `User`/HR module) — `id`, `tenant_id`, `hospital_id`, `user_id` uuid (FK-by-convention to platform `User`, matching the existing pattern), `subjects_qualified` uuid[] (array of `cv_subjects.id`), `max_periods_per_day integer NULL`, `max_periods_per_week integer NULL`, `is_substitute_eligible boolean DEFAULT true`, timestamps. Populated lazily/upserted on first assignment rather than requiring a separate onboarding step.

**New `cv_teacher_availability`** — `id`, `tenant_id`, `hospital_id`, `teacher_id`, `type varchar(30)` (ABSENT/LEAVE/TRAINING/MEETING/HOSPITAL_VISIT/THERAPY_SESSION/OFF_SITE_ASSIGNMENT/OTHER), `severity varchar(10)` (HARD_BLOCK/SOFT_WARN), `start_datetime`, `end_datetime`, `reason text NULL`, `source varchar(20)` (MANUAL/HR_SYNC/LEAVE_SYSTEM), `created_by`, timestamps. Indexed on `(teacher_id, start_datetime, end_datetime, tenant_id)`.

**New `cv_timetable_change_requests`** — unifies exchange, swap, and substitute requests under one auditable table with a `request_type` discriminator (EXCHANGE/SWAP/SUBSTITUTE/PERMANENT_CHANGE): `id`, `tenant_id`, `hospital_id`, `request_type`, `status` (PENDING_COUNTERPARTY/PENDING_APPROVAL/APPROVED/REJECTED/DECLINED/BLOCKED/COMPLETED/ROLLED_BACK/EXPIRED), `initiating_teacher_id`, `counterparty_teacher_id NULL`, `original_period_id NULL`, `counterparty_period_id NULL` (for swaps), `substitute_teacher_id NULL`, `affected_date_start`, `affected_date_end NULL` (single date for one-off, range for week/long-term), `reason text`, `approval_instance_id NULL` (FK into the workflow-engine's `hdsp_document_workflow_instances`, see Section 6), `resulting_override_ids uuid[] NULL` (links to the `cv_timetable_period_overrides` rows actually created), `rolled_back_at`/`rolled_back_by`/`rollback_reason` NULL, timestamps.

**New `cv_resources`** — `id`, `tenant_id`, `hospital_id`, `name`, `type varchar(30)` (COMPUTER_LAB/THERAPY_ROOM/LIBRARY/PLAY_AREA/SENSORY_ROOM/SPEECH_ROOM/MUSIC_ROOM/ART_ROOM/CLASSROOM/OTHER), `capacity integer NULL`, `is_active boolean DEFAULT true`, `maintenance_from`/`maintenance_to timestamp NULL` (resource-maintenance edge case), timestamps.

**New `cv_special_days`** — `id`, `tenant_id`, `hospital_id`, `date_start`, `date_end`, `type varchar(30)` (HOLIDAY/HALF_DAY/FESTIVAL/SPORTS_DAY/ANNUAL_DAY/EXAM_WEEK/ASSESSMENT_WEEK/PARENT_MEETING/MEDICAL_CAMP/THERAPY_CAMP/SCHOOL_CLOSURE/UNEXPECTED_CLOSURE/RAIN_HOLIDAY/EMERGENCY_CLOSURE), `affects_all_classes boolean DEFAULT true`, `affected_class_ids uuid[] NULL`, `timetable_behavior varchar(20)` (SUSPEND_ALL/HALF_DAY_TRUNCATE/CUSTOM_SCHEDULE), `custom_schedule_notes text NULL`, `created_by`, timestamps. Drives automatic timetable suspension/truncation rather than manual period-by-period cancellation.

**New `cv_lesson_completion_records`** — `id`, `tenant_id`, `hospital_id`, `period_id` (or `override_id`), `date`, `teacher_id` (actual teacher who delivered, may differ from scheduled), `status varchar(20)` (COMPLETED/PARTIALLY_COMPLETED/NOT_COMPLETED/CANCELLED/SUBSTITUTED/MOVED/RESCHEDULED), `notes text NULL`, `marked_by`, `marked_at`, timestamps. Optional (teachers "may" mark it per the brief) — nullable/absent record = "not yet marked," not an error state.

**New `cv_timetable_approval_config`** — see Section 7 (Configuration Design); stored per tenant, per change-type, with step definitions either inline (jsonb) or as FK references into the workflow-engine's `WorkflowTemplate`.

**Modify `cv_settings`** — add the timetable/approval/notification/escalation toggles enumerated in Section 7, following the existing one-row-per-tenant pattern (or promote to a keyed settings table if per-branch/per-hospital override becomes a requirement — flagged as an open question in Section 14).

**Indexing summary.** Beyond the two composite conflict-detection indexes above: index `cv_timetables(class_id, academic_year_id, term_id, status)`, `cv_timetable_change_requests(status, tenant_id)`, `cv_teacher_availability(teacher_id, start_datetime)`, `cv_special_days(date_start, date_end, tenant_id)`. All new tables get `tenant_id` indexed per existing tenant-isolation convention.

**Caching strategy.** Read-heavy, write-light data (published/active timetables, resource lists, special-day calendars) are strong candidates for the existing Redis instance already used by the Bull queues — cache key `cv:timetable:active:{classId}:{academicYearId}`, invalidated on publish/supersede events, TTL as a safety net (e.g., 1 hour) behind explicit invalidation. Teacher day-schedule aggregation (`getTeacherScheduleForDay`, already a multi-source join today) is the highest-value caching target given it is likely the most frequently hit read path (teacher workspace home screen).

---

## 4. Entity Relationships

```
CvAcademicYear 1---* CvTerm
CvAcademicYear 1---* CvTimetable
CvClass 1---* CvTimetable (versions; only one ACTIVE at a time per class+year+term)
CvClass 1---* CvSection
CvClass 1---* CvClassSubjectTeacher *---1 CvSubject
CvClassSubjectTeacher *---1 (User, via teacher_id)
CvTimetable 1---* CvTimetablePeriod
CvTimetablePeriod *---1 CvSubject
CvTimetablePeriod *---1 (User, via teacher_id) [to be formalized]
CvTimetablePeriod *---1 CvResource
CvTimetablePeriod 1---* CvTimetablePeriodOverride
CvTimetablePeriod 1---* CvStudentScheduleOverride
CvTimetablePeriod 1---* CvLessonCompletionRecord
(User) 1---* CvTeacherProfile
(User) 1---* CvTeacherAvailability
CvTimetableChangeRequest *---1 CvTimetablePeriod (original_period_id)
CvTimetableChangeRequest *---1 CvTimetablePeriod (counterparty_period_id, nullable)
CvTimetableChangeRequest *---1 WorkflowInstance (approval_instance_id, nullable — document-platform engine)
CvTimetableChangeRequest 1---* CvTimetablePeriodOverride (resulting_override_ids)
CvSpecialDay *---* CvClass (via affected_class_ids, or all classes if affects_all_classes)
CvTimetableApprovalConfig *---1 (tenant) 1---* WorkflowTemplate (document-platform engine, one template per change_type/level combination)
```

Every entity above additionally carries `tenant_id` (+ `hospital_id`), forming an implicit tenant-scoping relationship enforced at the repository layer via the existing `TenantScopedRepository`/`TenantContextInterceptor` infrastructure — no new isolation mechanism required, only consistent adoption.

---

## 5. State Machines

### 5.1 Timetable version lifecycle

States: `DRAFT`, `IN_REVIEW`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `PUBLISHED`, `ACTIVE`, `SUPERSEDED`, `ARCHIVED`, `SUSPENDED`.

Transitions: DRAFT→IN_REVIEW (submit), IN_REVIEW→DRAFT (changes requested), IN_REVIEW→PENDING_APPROVAL (review passed or review step disabled), DRAFT→PENDING_APPROVAL (review step disabled), PENDING_APPROVAL→APPROVED (all approval steps pass), PENDING_APPROVAL→REJECTED (any required step rejects), REJECTED→DRAFT (new edit cycle, increments a `revisionOfVersion` marker but not the published version number until re-published), APPROVED→PUBLISHED (immutable snapshot taken), PUBLISHED→ACTIVE (effective date reached, automated), ACTIVE→SUPERSEDED (a newer version reaches its effective date), ACTIVE→SUSPENDED (emergency/special-day trigger or manual admin action), SUSPENDED→ACTIVE (manual reactivation or configured auto-resume date), ACTIVE→ARCHIVED (term/academic year ends), SUPERSEDED→ARCHIVED (term/year ends; superseded versions remain queryable indefinitely before archival, archival is a retention/UX classification, not a deletion). PUBLISHED, ACTIVE, SUPERSEDED, and ARCHIVED versions are immutable — any change creates a new DRAFT version with `parent_version_id` pointing at the version being amended, per the versioning requirement.

### 5.2 Approval task state (per approval step, hosted in the workflow-engine's `WorkflowTask`)

`PENDING` → `CLAIMED` (approver opens it, optional) → `COMPLETED` (approved or rejected, both are terminal-completed outcomes distinguished by an `outcome` field) or `CANCELLED` (request withdrawn or superseded by a newer request) or, via SLA breach, `PENDING` → escalation event → task re-assigned to escalation target, still `PENDING`, with `escalationLevel` incremented — this maps directly onto the existing `workflow-task.entity.ts` fields (`status`, `dueDate`, `slaMinutes`, `escalationLevel`, `escalationRule`), requiring no new state machine, only a new `WorkflowTemplate` definition scoped to timetable change types.

### 5.3 Change request state (exchange/swap/substitute — `cv_timetable_change_requests.status`)

`PENDING_COUNTERPARTY` (swap/exchange only; skipped for substitute assignment which has no counterparty to accept) → `DECLINED` (terminal) or `PENDING_APPROVAL` → `REJECTED` (terminal) or `APPROVED` → `BLOCKED` (conflict found at execution time; requires manual re-resolution, loops back to `PENDING_APPROVAL` after a new slot is chosen, or terminates as `REJECTED` by the requester) or `COMPLETED` (override applied) → `ROLLED_BACK` (terminal, post-completion reversal). A separate `EXPIRED` terminal state applies to any non-terminal status when a configurable request-validity window elapses without resolution (Section 7's "Approval Validity").

### 5.4 Substitute assignment state

`ASSIGNED` → `ACTIVE` (coverage period has started) → `COMPLETED` (coverage period ended naturally) or `EARLY_TERMINATED` (original teacher returns early, or substitute becomes unavailable — triggers re-substitution per Section 2, domino case) or `CONVERTED_TO_PERMANENT` (long-term substitute becomes teacher of record, triggers the Permanent Change workflow of Section 2.6).

---

## 6. Approval Workflow Design

**Design decision: integrate with the existing `document-platform/workflow-engine` rather than build a parallel approval engine.** That engine already provides everything the brief asks for as "configurable, no hardcoded rules": a JSONB-driven `WorkflowDefinition` DSL, versioned/published/archived `WorkflowTemplate` rows, `WorkflowInstance` execution tracking with `currentState`/`currentAssignee`, and `WorkflowTask` rows with role/department/team/user assignment plus `dueDate`/`slaMinutes`/`escalationLevel`/`escalationRule` — precisely the primitives needed for Single/Two-Level/Multi-Level approval, escalation, and reminders. Building a second engine inside Children's Village would duplicate this and diverge over time.

**Integration shape.** A new `CvTimetableApprovalConfig` (tenant-scoped) maps a `(changeType, approvalMode)` pair to a specific `WorkflowTemplate` id. Administrators author the approval chain using whatever admin UI already exists for `WorkflowTemplate` (or a Children's-Village-specific thin wrapper over the same API, described in Section 13), selecting approvers by role (Main Class Teacher of the affected class — resolved dynamically per class via `CvClass.classTeacherId`, not a static role assignment; Head Teacher; Principal; Administrator) or by specific user, in whatever step order and count the tenant wants. When a timetable version or change request needs approval, the CV module calls the workflow-engine's instance-creation API, passing the resolved template id and a context payload (timetable/change-request id, affected class, affected teachers). The workflow engine drives `WorkflowTask` creation, notification (via its own `workflow-notification.listener.ts`, which should be extended or mirrored to also fire the CV module's notification templates — see Section 10), SLA timers, and escalation. On instance completion, a listener on the CV side (new: `cv-approval-completion.listener.ts`) reads the outcome and drives the `CvTimetable`/`CvTimetableChangeRequest` state transition (Sections 5.1/5.3).

**Configurable dimensions (all stored in `cv_timetable_approval_config`, none hardcoded):** `approval_mode` (DISABLED/SINGLE/TWO_LEVEL/MULTI_LEVEL), per-step `approver_type` (ROLE/SPECIFIC_USER/CLASS_TEACHER_OF_RECORD) and `approver_value`, `auto_approve_if_no_approver_available` (boolean, with an explicit warning surfaced to the admin UI that this is a fallback, not a default), `emergency_override_roles` (array — who may force-publish bypassing approval, always logged as `CV_TIMETABLE_EMERGENCY_OVERRIDE`), `escalation_timeout_minutes`, `reminder_interval_minutes`, `auto_cancel_after_minutes` (maps to `EXPIRED` in Section 5.3), `delegation_allowed` (boolean — may an approver nominate a delegate; if true, delegate assignment is itself audited), `approval_validity_days` (how long an APPROVED-but-not-yet-published state remains valid before requiring re-approval — guards against a stale approval being used weeks later after conditions changed), and `requester_cannot_approve_own_request` (boolean, defaulting true, addressing the deadlock edge case from Section 1.3).

**Per-change-type override.** Because the brief's examples (routine draft edit vs. teacher-initiated exchange vs. class merge) plausibly warrant different rigor, `cv_timetable_approval_config` keys on `change_type` so a tenant can require, e.g., DISABLED for single-period exchanges, SINGLE approval for swaps, and MULTI_LEVEL (Head Teacher + Principal) for class merges or teacher replacements — all independently configurable, none hardcoded in application logic.

---

## 7. Configuration Design

New Children's Village Settings pages (extending the existing `settings/` sub-module and its single-tenant-row `CvSettings` pattern — recommend splitting into a dedicated `cv_timetable_settings` table given the number of new fields, still one-to-one with tenant, with a documented future path to per-branch override if requested):

**Timetable Settings** — default period duration, school day start/end, number of periods per day, whether `period_number` or raw time-of-day drives scheduling, default resource-booking requirement per subject category (e.g., THERAPEUTIC subjects always require a resource booking).

**Approval Settings** — the full `cv_timetable_approval_config` matrix described in Section 6, exposed per change type.

**Teacher Assignment Settings** — whether a teacher may be assigned outside their `subjects_qualified` list (block/warn/allow), `max_periods_per_day`/`max_periods_per_week` enforcement mode (block/warn/allow), whether Main Class Teacher must also be a subject teacher for at least one period in their own class.

**Substitute Teacher Rules** — eligibility criteria (subject-qualified only vs. any active teacher), whether substitution requires approval by duration category (Section 2.5), auto-notification list, whether a substitute assignment auto-converts to a Permanent Change workflow after a configurable duration threshold (e.g., >20 teaching days triggers a prompt).

**Conflict Resolution Rules** — which conflict types are HARD_BLOCK vs. SOFT_WARN (teacher double-booking likely always hard; room conflict for two low-priority activities might be soft-warn with override permission), who may override a soft-warn (and that override is always audited), whether Special Days automatically suspend timetables or require manual confirmation per class.

**Notification Rules** — channel selection (in-app/email/WhatsApp — all three already supported by the existing `NotificationService` providers) per event type, quiet hours, digest vs. immediate delivery, guardian notification opt-in per event type (period changes affecting their child).

**Holiday/Special Day Rules** — who may declare an Unexpected/Emergency Closure (likely Administrator/Principal only, time-sensitive so likely bypasses normal approval), default `timetable_behavior` per special-day type.

**Lesson Rules** — whether Lesson Completion marking is mandatory or optional (brief says optional; make it tenant-configurable rather than hardcoded), grace period for marking after a period ends, whether unmarked lessons auto-flag for Head Teacher review after N days.

**Versioning Rules** — retention period for ARCHIVED versions (compliance-driven, likely "indefinite" for a special-education context but configurable), whether version comparison/diff view is enabled, minimum gap between consecutive re-publications (throttle against accidental thrash).

**Audit Rules** — this largely inherits the platform-wide `AuditService` configuration; the CV-specific setting needed is which additional business events (beyond CRUD) get audited at INFO vs. WARN severity (e.g., conflict override = WARN, emergency publish = WARN).

**Escalation Rules** — global default escalation chain if a change-type-specific one isn't configured, business-hours-only vs. 24/7 SLA clocks.

**Automation Rules** — auto-approval thresholds (e.g., single-period same-subject swaps between two teachers both already qualified may be configured to skip approval entirely), auto-revert behavior for expired substitutes, auto-suspend on Special Day.

---

## 8. Permission Matrix

Permission strings follow the existing `MODULE:RESOURCE:ACTION` convention (e.g., `CV:TIMETABLE:PUBLISH`), enforced via the existing `PermissionsGuard`. "View own" denotes row-level restriction to records where the user is the assigned teacher; "View all" is tenant-wide within CV.

| Action | Administrator | Principal | Head Teacher | Main Class Teacher | Subject Teacher | Therapist | Academic Coordinator | Viewer |
|---|---|---|---|---|---|---|---|---|
| View timetables (all classes) | Yes | Yes | Yes | Own class + view others | View | View (own therapy sessions) | Yes | Yes |
| Create/edit draft timetable | Yes | Yes | Yes | Own class | No | No | Yes | No |
| Submit for review | Yes | Yes | Yes | Own class | No | No | Yes | No |
| Approve (any configured step) | Yes (any step) | Per config | Per config | Per config (own class only) | No | No | No | No |
| Publish | Yes | Yes | Per config | No | No | No | No | No |
| Emergency override/force-publish | Yes | Yes | No | No | No | No | No | No |
| Edit published (creates new version) | Yes | Yes | Per config | Own class, per config | No | No | Yes | No |
| Archive/restore version | Yes | Yes | No | No | No | No | No | No |
| Request period exchange | Yes | Yes | Yes | Own periods | Own periods | Own sessions | No | No |
| Accept/decline exchange or swap | N/A | N/A | N/A | Own periods | Own periods | Own sessions | N/A | N/A |
| Assign substitute | Yes | Yes | Yes | No | No | No | Yes | No |
| Record teacher availability (self) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Record teacher availability (others) | Yes | Yes | Yes | No | No | No | Yes | No |
| Manage resources (rooms/labs) | Yes | Yes | Yes | No | No | No | Yes | No |
| Declare Special Day (routine) | Yes | Yes | Yes | No | No | No | Yes | No |
| Declare Emergency/Unexpected Closure | Yes | Yes | No | No | No | No | No | No |
| Manage student schedule exceptions | Yes | Yes | Yes | No | No | Yes (own discipline) | Yes | No |
| Mark lesson completion | Yes | Yes | Yes | Own periods | Own periods | Own sessions | No | No |
| Configure approval workflow | Yes | Yes | No | No | No | No | No | No |
| Configure other Timetable Settings | Yes | Yes | No | No | No | No | No | No |
| View reports (own scope) | Yes | Yes | Yes | Own class | Own periods | Own sessions | Yes | Yes |
| View reports (tenant-wide) | Yes | Yes | Yes | No | No | No | Yes | Per config |
| View audit trail | Yes | Yes | Limited (own class events) | No | No | No | No | No |

All rows above are permission *bundles* to be seeded as discrete `CV:TIMETABLE:*` strings (e.g., `CV:TIMETABLE:CREATE`, `CV:TIMETABLE:PUBLISH`, `CV:TIMETABLE:APPROVE`, `CV:TIMETABLE:EMERGENCY_OVERRIDE`, `CV:TIMETABLE:SETTINGS:MANAGE`) so tenants can deviate from this default matrix — since Principal/Head Teacher are not confirmed as fixed platform roles today, this matrix should be implemented as a *default permission-to-role mapping seeded per tenant*, editable afterward, not compiled-in logic.

---

## 9. API Design

Following the existing controller/service/repository pattern (`@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)`, `@RequireModule('CHILDRENS_VILLAGE')`, `@UseInterceptors(TenantContextInterceptor)`, class-validator DTOs, TypeORM repositories, optionally `TenantScopedRepository`):

**New `CvTimetableController`** (currently missing entirely) at `childrens-village/timetables`: `GET /classes/:classId/timetables` (list versions), `GET /timetables/:id` (one version + periods), `POST /classes/:classId/timetables` (create draft), `PATCH /timetables/:id/periods` (bulk period edit, draft-only), `POST /timetables/:id/submit-review`, `POST /timetables/:id/submit-approval`, `POST /timetables/:id/publish`, `POST /timetables/:id/emergency-publish`, `POST /timetables/:id/archive`, `GET /timetables/:id/versions/compare?otherId=`, `POST /timetables/:id/rollback` (creates a new draft cloned from an archived version).

**New `CvConflictController`** (or folded into a `ConflictEngineService` called synchronously by writes): `POST /timetables/conflicts/check` (dry-run validation given a proposed period set, used by the authoring UI before submit).

**New `CvTimetableChangeRequestController`** at `childrens-village/timetable-change-requests`: `POST /exchange`, `POST /swap`, `POST /substitute`, `GET /:id`, `POST /:id/respond` (counterparty accept/decline), `POST /:id/rollback`, `GET /?status=&teacherId=`.

**New `CvTeacherAvailabilityController`**: `POST /`, `GET /?teacherId=&from=&to=`, `DELETE /:id`.

**New `CvResourceController`**: standard CRUD + `GET /:id/availability?from=&to=`.

**New `CvSpecialDayController`**: standard CRUD, `GET /calendar?from=&to=`.

**Extend existing `CvTeacherWorkspaceController`**: keep the three existing routes, add `GET /schedule/conflicts`, `GET /schedule/pending-requests` (exchange/swap/approval items awaiting this teacher's action).

**Services:** `CvTimetableService` (extend existing — add version/lifecycle methods), new `ConflictEngineService` (pure-ish, stateless overlap-detection given a candidate period against all sources: other periods for same teacher/room/class, `CvTeacherAvailability`, `CvSpecialDays`), new `CvApprovalIntegrationService` (thin adapter to `document-platform/workflow-engine`'s `WorkflowEngineService`), new `CvTimetableChangeRequestService` (exchange/swap/substitute orchestration per Section 2.3–2.5), new `CvResourceService`, new `CvSpecialDayService`. All inject `AuditService` and `NotificationService` per existing patterns (already done in `cv-academic-year.service.ts`, to be followed here).

**Versioning strategy:** immutable snapshot-on-publish. `PUBLISHED`/later-state rows and their `CvTimetablePeriod` children are never updated in place; any edit request against a non-DRAFT version triggers a deep clone (new `CvTimetable` row with incremented `version`, new `CvTimetablePeriod` rows with fresh ids, `parent_version_id` set) before edits are applied to the clone. This preserves the existing `CvTimetablePeriodOverride`/`CvStudentScheduleOverride` "day-level exception" mechanism unchanged for same-version tweaks, while version bumps handle template-level changes — the two mechanisms are complementary, not competing.

---

## 10. Notification Matrix

Delivered via the existing `NotificationService` (queue-based, channel providers already support in-app/email/WhatsApp) using per-event templates in `notification_templates`.

| Event | Recipients | Default Channel(s) | Configurable? |
|---|---|---|---|
| Timetable submitted for review | Reviewer(s) | In-app + email | Yes |
| Review changes requested | Requester | In-app | Yes |
| Approval requested (per step) | Step approver(s) | In-app + email | Yes |
| Approval granted | Requester, next approver (if any) | In-app | Yes |
| Approval rejected | Requester, prior approvers | In-app + email | Yes |
| Reminder before approval SLA breach | Current approver | In-app + email | Yes (interval) |
| Escalation triggered | Escalation target, original approver (cc) | In-app + email | Yes |
| Timetable published | Affected teachers, Main Class Teacher, (opt) guardians | In-app + email | Yes |
| Timetable version superseded/archived | Affected teachers | In-app | Yes |
| Emergency override/force-publish used | Administrator(s), Principal | In-app + email | No (always on) |
| Teacher marked absent/on leave | Head Teacher, Academic Coordinator, admin scheduling role | In-app + email | Yes |
| Conflict detected (hard block) | Author of the conflicting change | In-app, blocking (synchronous UI) | No (always on) |
| Conflict detected (soft warn) | Author of the change | In-app | Yes |
| Exchange/swap requested | Counterparty teacher | In-app + email | Yes |
| Exchange/swap accepted/declined | Requesting teacher | In-app | Yes |
| Exchange/swap approved/rejected | Both teachers | In-app + email | Yes |
| Substitute assigned | Substitute teacher, original teacher, Main Class Teacher | In-app + email | Yes |
| Substitute assignment ending soon | Substitute, Head Teacher | In-app | Yes |
| Substitute converted to permanent | Administrator, HR-adjacent role | In-app + email | Yes |
| Period changed (any override applied) | Affected teacher(s), (opt) guardians | In-app | Yes |
| Special Day declared (routine) | All affected teachers | In-app + email | Yes |
| Emergency/unexpected closure declared | All staff + (opt) guardians, broadcast priority | In-app + email + WhatsApp | Partially (channel choice yes, event itself always fires) |
| Student schedule exception created/changed | Class teacher, subject teacher affected, therapist | In-app | Yes |
| Lesson marked not-completed/cancelled | Head Teacher, Academic Coordinator | In-app (digest option) | Yes |
| Rollback performed | All parties to the original change, Administrator | In-app + email | No (always on) |
| Reminder before first class of the day | Teacher (self) | In-app push | Yes (opt-in) |
| Settings/approval configuration changed | Administrator(s) | In-app | No (always on) |

---

## 11. Audit Matrix

All events flow through the existing `AuditService` (`module: 'CHILDRENS_VILLAGE'`, `entityType`, `entityId`, `oldValue`/`newValue` jsonb, actor, timestamp) — no new audit infrastructure required.

| Event | Entity | Old/New Captured | Notes |
|---|---|---|---|
| Timetable created (draft) | CvTimetable | New | includes source (blank vs. cloned-from-version) |
| Period added/edited/removed | CvTimetablePeriod | Old + New | includes scope (THIS_DAY vs ALL_FUTURE) |
| Submitted for review/approval | CvTimetable | Status transition | |
| Approval step completed | WorkflowTask (via engine) + CvTimetable status mirror | Outcome + approver | cross-referenced by `approval_instance_id` |
| Timetable published | CvTimetable | Status + version | |
| Version superseded/archived | CvTimetable | Status | |
| Emergency override used | CvTimetable | Actor + justification (mandatory reason field) | flagged severity WARN |
| Conflict detected | ConflictEngine result | Conflict type + entities involved | logged even if user proceeds (soft-warn override) |
| Conflict overridden | CvTimetablePeriod / change request | Who overrode + reason | severity WARN |
| Teacher availability recorded | CvTeacherAvailability | New | |
| Exchange/swap requested/accepted/declined/approved/rejected | CvTimetableChangeRequest | Status transitions | full chain retained |
| Exchange/swap applied | CvTimetablePeriodOverride | New (linked to request) | |
| Exchange/swap rolled back | CvTimetablePeriodOverride + CvTimetableChangeRequest | Old (restored) + reason | mandatory reason |
| Substitute assigned/ended/converted | Substitute assignment (change request) | Status + linked teacher ids | |
| Resource booked/released | CvResource / period link | New/removed | |
| Special Day declared/edited | CvSpecialDay | New/Old | emergency closures flagged severity WARN |
| Student schedule exception created/changed | CvStudentScheduleOverride | Old + New | |
| Lesson completion marked | CvLessonCompletionRecord | New | |
| Settings/approval configuration changed | CvTimetableApprovalConfig / CvTimetableSettings | Old + New | severity WARN, admin-only |
| Version restored/rollback (whole-timetable) | CvTimetable | Restored-from version id | |
| Bulk import/export performed | N/A (batch op) | Row count + file reference | |

---

## 12. Reporting Design

Beyond the brief's list, add: **Guardian notification delivery report** (did opt-in notifications actually send — operational trust), **Approval SLA compliance report** (% of approvals completed within configured timeout, by approver — identifies bottleneck individuals), **Emergency override log** (standalone view of every force-publish/emergency-closure event, high visibility for compliance review), and **Student pull-out load report** (which students are missing the most instructional time to therapy/medical exceptions — relevant given the special-education context implied by "therapy," "sensory room," "IEP"-adjacent module names found in the codebase).

Standard reports: Teacher workload (periods/week, by subject, vs. `max_periods_per_week`), Class timetable (printable weekly grid), Teacher timetable (printable weekly grid, cross-class), Subject distribution (periods per subject per class/week), Room/resource utilization, Substitute history (by teacher, by class, frequency trend), Approval statistics (average time-to-approve, rejection rate, by approver/role), Conflict statistics (count by type, hard vs. soft, override rate), Missed/cancelled lessons, Lesson completion rate, Teacher exchange/swap history, Configuration change history. All reports respect the existing tenant-scoping and the permission matrix's "own scope vs. tenant-wide" distinction (Section 8), and are built as read-side projections/materialized queries against the tables in Section 3 rather than new write-path entities.

---

## 13. UI Navigation

```
Children's Village
└── Timetable Management (new top-level nav item)
    ├── My Schedule (existing teacher-workspace views, extended)
    │   ├── Today / Week view
    │   ├── Pending requests (exchanges, swaps, approvals awaiting me)
    │   └── My availability (declare leave/training/etc.)
    ├── Class Timetables
    │   ├── [Class] → Timetable Editor (Draft authoring, conflict panel inline)
    │   ├── [Class] → Version History (compare, rollback)
    │   └── [Class] → Approval Status
    ├── Substitutes
    │   ├── Coverage Board (who's absent, who's uncovered)
    │   └── Assign Substitute
    ├── Resources
    │   ├── Resource List (labs, therapy rooms, etc.)
    │   └── Resource Calendar
    ├── Special Days Calendar
    ├── Reports (list from Section 12)
    └── Settings (Administrator/Principal only — nests under existing
        Children's Village → Settings)
        ├── Timetable Settings
        ├── Approval Settings
        ├── Teacher Assignment Settings
        ├── Substitute Rules
        ├── Conflict Resolution Rules
        ├── Notification Rules
        ├── Holiday/Special Day Rules
        ├── Lesson Rules
        ├── Versioning Rules
        └── Escalation Rules
```

**Dashboards.** *Principal*: tenant-wide publish status by class, pending approvals awaiting Principal, emergency override log, SLA compliance widget. *Head Teacher*: classes under their remit, uncovered periods today, pending approvals awaiting them. *Teacher*: today's schedule, pending exchange/swap requests, availability quick-declare. *Administrator*: system health (conflict rate, approval bottlenecks), configuration shortcuts, emergency closure trigger. *Academic Coordinator*: cross-class subject distribution, substitute pool status, lesson completion compliance.

---

## 14. Risk Analysis

| Risk | Impact | Mitigation |
|---|---|---|
| No `CvTeacher`/typed relation exists today — `teacherId` is an unenforced uuid | Data integrity gap; a period could reference a nonexistent or wrong-role user | Introduce `cv_teacher_profiles` (Section 3) as the validated join point; add a DB-level FK to `users` if the platform schema allows cross-schema FKs, else enforce in service layer with a lookup + explicit role check |
| Confirmed absence of conflict detection today means production data may already contain double-bookings | A conflict-detection rollout could surface a wave of pre-existing violations, blocking legitimate edits | Ship the Conflict Engine in SOFT_WARN (report-only) mode first, run a one-time audit report against existing data, remediate, then flip to HARD_BLOCK per Section 7 |
| No timetable controller/RBAC today; the only exposed routes are ownership-gated with no permission strings | Introducing full RBAC could break the existing teacher-workspace UI if permission strings aren't seeded before the guard is enforced | Seed default `CV:TIMETABLE:*` permissions for all existing roles before deploying the new guarded routes; keep the three legacy teacher-workspace routes on their current ownership check unless explicitly migrated |
| Principal/Head Teacher not confirmed as existing platform roles | Approval Configuration referencing a role that doesn't exist per-tenant will silently stall the workflow | Approval Configuration UI must validate approver roles exist for the tenant at config-save time, and the engine must fail loudly (not silently skip) if a resolved approver set is empty |
| Reliance on the document-platform `workflow-engine`, built for a different domain | Coupling risk if that engine changes independently; possible feature gaps (e.g., "class teacher of record" as a dynamic approver type may not exist yet) | Confirm with the document-platform team whether dynamic/contextual approver resolution is supported before committing; budget for a small engine extension if not, rather than forking |
| Versioning introduces deep-clone-on-edit — risk of clone bugs silently dropping overrides/exceptions tied to the old version | Data loss risk on rollback/version compare | Explicit test coverage for override/exception re-pointing during clone; orphaned-override detection job (Section 2.6) |
| Concurrent edits to the same draft timetable by two authors | Lost-update race | Optimistic concurrency (version/row `updatedAt` check) on `PATCH` endpoints, consistent with typical NestJS/TypeORM patterns |
| Bulk import of a whole term's timetable | Large-blast-radius conflict surface, partial-failure UX | Dry-run validation endpoint (Section 9) mandatory before commit; transactional all-or-nothing import per class, partial success reported per row |
| Multi-tenant leakage in aggregate reports (workload, substitute history) | Compliance/privacy risk in a special-education context | Reuse `TenantScopedRepository` for every new query path without exception; add a regression test asserting cross-tenant report isolation |
| Emergency override / force-publish misuse | Governance risk — bypasses configured approval entirely | Restrict to Administrator/Principal only, always-on notification + audit (Sections 10–11), consider requiring a mandatory justification field with minimum length |
| `cv_settings` is one row per tenant with no branch/hospital override slot, but the schema has both `tenant_id` and `hospital_id` everywhere | New settings table inherits the same limitation, may not satisfy multi-campus tenants | Flag as an open question for stakeholder review before schema finalization — recommend designing `cv_timetable_settings` with `hospital_id` nullable-override capability from day one to avoid a painful migration later |

---

## 15. Recommended Implementation Phases

**Phase 0 — Foundations (no user-visible change).** Add `cv_class_subject_teachers`, `cv_teacher_profiles`, `cv_teacher_availability`, `cv_resources` tables; add versioning/status/notes/resource columns to `cv_timetables`/`cv_timetable_periods`; add the missing indexes; build the `CvTimetableController` with basic CRUD and the existing three teacher-workspace routes unaffected. Seed default `CV:TIMETABLE:*` permissions.

**Phase 1 — Conflict Engine (report-only).** Build `ConflictEngineService`, dry-run validation endpoint, run against production data in SOFT_WARN/report mode, produce the one-time remediation report from Section 14.

**Phase 2 — Lifecycle & Versioning.** Implement the state machine (Section 5.1), deep-clone-on-edit versioning, version compare/rollback UI, `CvSpecialDays` and their automatic suspend/truncate behavior.

**Phase 3 — Approval Integration.** Build `CvTimetableApprovalConfig`, integrate with `document-platform/workflow-engine`, ship Approval Settings UI, flip Conflict Engine to configurable HARD_BLOCK per Section 7.

**Phase 4 — Teacher-Initiated Workflows.** Exchange requests, swap requests, substitute assignment (including duration-category approval rules), rollback, all notification wiring (Section 10).

**Phase 5 — Permanent Change & Lesson Operations.** Permanent change workflow (Section 2.6) for teacher replacement/subject change/class merge/section split, Lesson Completion recording, Student Schedule Exception enhancements building on the existing `CvStudentScheduleOverride`.

**Phase 6 — Reporting, Dashboards, Polish.** Full report suite (Section 12), role dashboards (Section 13), bulk import/export, escalation/reminder tuning, audit-driven compliance views, performance tuning of the caching layer (Section 3).

Each phase should close with the verification discipline already implied by the existing codebase's testing conventions (unit tests for services, e2e tests for guarded controllers) plus an explicit tenant-isolation regression pass before merging, given the two-level `tenant_id`/`hospital_id` scoping this module must respect throughout.

---

*End of design specification. No implementation should begin until this document is reviewed and explicitly approved.*
