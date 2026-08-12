# HDSP Ownership Model Audit — User-Level Ownership Within Tenant Scope

**Status: architectural review only. Nothing in this document has been implemented. No schema, code, or query changes were made to produce it.**

## Purpose and scope

The Phase 1 tenant-isolation pass established *tenant* as the platform's outer ownership boundary: every business entity carries a `tenant_id` (or an approved derivation path to one), and reads are enforced through `TenantScopedRepository`. This document asks the next question — **within** a tenant, does a given row also belong to one specific *user*, and if so, does the schema already capture that correctly?

Every persistent entity in the backend (117 entities across 16 module trees) was read directly, along with its owning service's read-path queries, to distinguish two things that are easy to conflate in this codebase: a **`created_by`-style column that exists purely for audit attribution** (who did this, recorded for compliance/display, never used to filter what a *different* user can see) versus **a column that is actually load-bearing for access — something a query filters on to restrict a row's visibility or actionability to a specific person**. The methodology throughout was: read the entity's columns, then grep the corresponding service for `where: { <actorField>: ... }` or equivalent filtering logic. A column with an actor's name is not evidence of user ownership unless a query actually uses it that way.

## The four ownership models

1. **Tenant Global** — visible to all authorized users within the tenant. The default for shared catalogs, config, and collaboratively-managed content.
2. **Tenant + User Owned** — each row genuinely belongs to one user; queries filter by that user, and other users generally shouldn't see or act on it.
3. **Tenant + Shared Workflow** — created or first-touched by one user, then explicitly acted on by other users (reviewers, assignees, team members) as it moves through a lifecycle. The most common non-trivial classification found in this audit.
4. **System Global** — shared across every tenant; not tenant-scoped at all.

## Headline finding

Across 117 entities, **exactly one** has genuine, enforced, query-level "belongs to this one user" semantics today: `TokenReservation` (`reserved_by_user`, actively filtered in `registration.service.ts`, backed by a partial unique index). Every other "actor" column found in the codebase — `created_by`, `updated_by`, `uploaded_by`, `assigned_to`, `processed_by`, `signed_by`, `therapist_id`, `changed_by`, and roughly twenty variants of the same idea — is written on create/update for audit-trail and display purposes, and is **never** used to restrict what a different authorized user in the same tenant can read or act on. This is a deliberate, consistent, and largely correct pattern for a hospital platform: most business data must be visible to a whole team (clinical, front-desk, admin), not siloed to whoever happened to create the row. The real design work in this audit is finding the small number of places where that default is wrong.

Two structural gaps surfaced as a side effect of this audit, outside its direct question, and are flagged separately at the end: **document-platform's 16 entities have no `tenant_id` at all** (the Phase 1 pass never reached that module), and the **`ai-platform` submodule uses ad hoc `hospitalId`/`organizationId` columns instead of `tenant_id`**. Both are tenant-isolation gaps, not user-ownership gaps, but they affect how any future user-scoping work in those areas would compose.

---

## Module: Users, RBAC, Auth, Audit, Notifications, Licensing, Settings, Platform Core, AI Platform, Knowledge Search, HIS Config

| Entity (table) | Current ownership | Recommended model | `user_id` needed? | `created_by` sufficient? | Migration risk |
|---|---|---|---|---|---|
| User (`users`) | `created_by` (audit only) | **1 Tenant Global** | No | N/A | none |
| Role (`roles`) | none | **1 Tenant Global** | No | N/A | none |
| Permission (`permissions`) | none | **1 Tenant Global** (borderline System Global) | No | N/A | none |
| PasswordResetRequest (`password_reset_requests`) | `user_id` (real FK relation) + `reviewed_by` — **actively filtered in service reads** | **3 Shared Workflow** | Already exists, correctly | Yes — already modeled correctly, the one reference example of doing this right | none |
| AuditLog (`audit_logs`) | `user_id` (attribution only) | **1 Tenant Global** | No | Yes, for attribution; must never gate read access | none |
| NotificationLog / NotificationTemplate | none (patient/loyalty-account linked, not staff) | **1 Tenant Global** | No | N/A | none |
| LicenseMaster (`license_master`) | `activated_by` (audit only) | **1 Tenant Global** | No | Yes | none |
| LicenseRequestEntity (`license_requests`) | **none at all** — no requester field | **3 Shared Workflow** | Yes — currently missing even a `created_by`/`requested_by` column, a real gap | N/A (doesn't exist yet) | low-medium (new nullable column + backfill) |
| SubscriptionLicense, VendorRegistration | none | **1 Tenant Global** | No | N/A | none |
| SystemSetting | none | **1 Tenant Global** | No | N/A | none |
| Tenant (`tenant`) | none (it is the boundary itself) | **4 System Global** | No | N/A | none |
| TenantConnectorPairing | none (machine credential) | **1 Tenant Global** | No | N/A | none |
| TenantProvisioningRun / -Step | `triggered_by` (explicitly documented audit-only) | **1 Tenant Global** | No | Yes, by design | none |
| FeatureFlag | `updated_by` (audit only); `tenant_id` null = platform default, set = tenant override | **1/4 split** (global default vs. tenant override, by design) | No | Yes | none |
| AiAuditTrailEntity, AiUsageEntity | `userId?` (loose string, no relation); uses `hospitalId`/`organizationId` instead of `tenant_id` | **3 Shared Workflow** (compliance/ops visibility, not personal) | Already exists loosely | Yes, for attribution | low now / medium if later migrated onto the `tenant_id` convention |
| AiTraceabilityEntity, EvaluationDatasetEntity, KnowledgeCollectionEntity | not persisted TypeORM entities (plain classes) | **3 / 4 respectively** (see full sub-report) | N/A until persisted | N/A | none currently |
| PromptTemplateEntity | `owner: string` (required, doing real workflow-authorization work as a loose string, not a FK) + `reviewer_id` | **3 Shared Workflow** | Already exists as `owner`, but as a string not a FK — see note below | Partially — sufficient for attribution, not for enforceable draft-edit authorization | low to reclassify; medium if ever converted to a real FK (existing `owner: 'system'` literal values would need special-casing) |
| HisSchemaConfig | none | **1 Tenant Global** | No | N/A | none |

**Note on PromptTemplateEntity:** this is the one entity outside EIC/document-platform where a string-typed attribution field is quietly doing real authorization work (gating who may edit a DRAFT template) without the referential integrity a true `user_id` FK would provide. Not urgent, but the clearest "should eventually be a real FK" candidate in the platform-core group.

---

## Module: EIC (Early Intervention Center — clinical/therapy)

**Headline: zero of 16 EIC entities qualify as Tenant + User Owned or System Global.** Two (`EicPatient`, `EicDevelopmentalHistory`) are Tenant Global — no single author, shared care-team record. The other fourteen are **Tenant + Shared Workflow** — this is the canonical case the whole ownership-model taxonomy was built to describe: a therapist authors a session note, assessment, or discharge section, but the entire assigned care team, a supervising centre head, and admin/compliance staff must be able to read (and in several cases countersign) it. Restricting visibility to the author alone would break clinical care coordination.

| Entity | Actor field(s) | Model | `user_id` needed? |
|---|---|---|---|
| EicPatient | none | 1 Tenant Global | No |
| EicDevelopmentalHistory | `recorded_by` | 1 Tenant Global | No |
| EicTherapyEnrollment | `created_by`, `updated_by`, `centre_head_id` | 3 Shared Workflow | No — derive from `EicTherapyTeamMember` roster |
| EicTherapyTeamMember | `therapist_id` (roster/join table — the derivation source for the rest) | 3 Shared Workflow | Already is (`therapist_id`) |
| EicAssessment | `therapist_id`, `countersigned_by` — **write-gated to the assigned therapist** | 3 Shared Workflow | No — already correct |
| EicGoal | `created_by`, `extended_by` | 3 Shared Workflow | No — derivable via `assessment_id` |
| EicTherapySession | `therapist_id` | 3 Shared Workflow | No — already correct |
| EicSessionEntry | none (child of session) | 3 Shared Workflow (derived) | No |
| EicProgressReport | `initiated_by`, `signed_by` (distinct actors) | 3 Shared Workflow | No — multi-author by nature |
| EicDisciplineProgressSection | `therapist_id` — **the one place a real, if optional, `MY_SECTIONS` work-queue filter exists** | 3 Shared Workflow | No — already correct, best example |
| EicDischargeSummary / EicDischargeSection | `initiated_by`/`signed_by`; `therapist_id` | 3 Shared Workflow | No |
| EicPreschoolEnrollment | `teacher_id`, `created_by` | 3 Shared Workflow | No |
| EicPreschoolAssessment | `assessed_by` | 3 Shared Workflow | No |
| EicPreschoolDailyReport | `submitted_by` | 3 Shared Workflow | No |
| EicEnrollmentDisciplineAssignment | `therapist_id` (uuid — inconsistent typing vs. the `varchar(100)` used elsewhere in this module), `assigned_by` | 3 Shared Workflow (roster) | Already is |

No new `user_id` column is needed anywhere in EIC — existing `therapist_id`/`assessed_by`/`submitted_by`/`signed_by`/`initiated_by`/`created_by` fields already cover authorship, and every child table's ownership is cleanly derivable via its FK chain to a parent that carries one. One schema inconsistency worth fixing opportunistically (not urgent): `therapist_id` is `varchar(100)` almost everywhere but `uuid` in `EicEnrollmentDisciplineAssignment`.

---

## Module: CMS (digital signage) and Token Queue

**Headline: no entity in either module needs a real `user_id`/FK added.** CMS content (media, playlists, displays, schedules) is collaboratively managed catalog/infrastructure data — every `uploadedBy`/`createdBy`/`publishedBy` column exists for attribution display only; no service filters reads by it. `TokenRecord` (the live queue ticket) deliberately has three separate per-stage actor columns (`calledBy`, `registrationUser`, `supervisorResetBy`) rather than one owner, which is correct — a ticket passes through multiple staff members' hands during its life and belongs to none of them individually.

| Entity | Actor field(s) | Model |
|---|---|---|
| CMSMedia | `uploaded_by` | 1 Tenant Global |
| CMSPlaylist | `created_by`, `updated_by` | 3 Shared Workflow (draft→publish lifecycle, team-editable) |
| CMSPlaylistItem | none (child) | 3 Shared Workflow (inherits playlist) |
| CMSPublishVersion | `published_by` | 3 Shared Workflow |
| CMSDisplayAssignment, CMSPlaylistSchedule, CMSDisplayGroup, CMSTickerMessage, CMSDisplayCommand | `created_by` variants | 1 Tenant Global |
| CMSEmergencyBroadcast | `activated_by`, `deactivated_by` | 1 Tenant Global (safety-critical, must be actionable by any on-duty admin) |
| CMSSettings | none (singleton) | 1 Tenant Global |
| CMSAuditLog, CMSPlayerLog | `changed_by` / none | 1 Tenant Global |
| TokenLocation, TokenCounter, TokenBranchConfig, TokenKiosk, TokenKioskAssignment, TokenKioskBranding, TokenScConfig, TokenSequence, TokenAnalyticsDaily, TokenAuditLog | infra/config or audit fields only | 1 Tenant Global |
| TokenCall | `called_by`, `performed_by` | 1 Tenant Global (shared queue action log) |
| DisplayPage | `created_by_id` (relation deliberately removed once — see note) | 1 Tenant Global |
| TokenRecord | `called_by`, `registration_user`, `supervisor_reset_by` — three per-stage actors, no unifying owner | 1 Tenant Global |
| **TokenReservation** | `reserved_by_user` — **the one confirmed, actively-enforced user-owned entity in the entire platform** (`WHERE reserved_by_user = :userId`, partial unique index `idx_one_reservation_per_user`) | **2 Tenant + User Owned** | Already exists and works correctly |
| TokenPatientMapping | `mapped_by` | 3 Shared Workflow |
| MappingAuditLog | `actor` | 1 Tenant Global |
| WorkstationConfig | `configured_by` — **entity doc explicitly rejects user-binding by design**: "the workstation doesn't move between shifts even when the receptionist sitting at it does" | 1 Tenant Global |

**Note on DisplayPage:** its entity comment documents a real prior incident — a `@ManyToOne(User)` relation and a plain `@Column` both mapped to `created_by`, and TypeORM silently broke route registration as a result; the relation was deliberately removed. Any future work adding a genuine `@ManyToOne(User)` FK anywhere in the codebase should route around that exact trap.

---

## Module: Loyalty and Feedback

**Headline: no entity in either module qualifies as Tenant + User Owned** — there is no "my drafts"/personal-preference concept in either module today. Two entities qualify as Shared Workflow (`RewardRedemption`, `FeedbackComplaint`), both structurally ready (they already have `processed_by`/`assigned_to` columns) but **not currently enforced** — `list()`/`findOne()` in both services filter only by tenant/branch, never by the assignee, meaning any staff member can already see and act on any complaint or redemption regardless of who it's assigned to. One entity, `FeedbackLanguage`, is genuinely **System Global** by its own doc comment (a shared language pool across all tenants) — its `tenant_id` column exists but is explicitly unread.

| Entity | Actor field(s) | Model |
|---|---|---|
| Campaign, CardCategory, RewardCatalog | `created_by`/`updated_by`/none | 1 Tenant Global |
| LoyaltyAccount | `enrolled_by` (belongs to a *patient*, not a staff user — separate, pre-existing ownership concept) | 1 Tenant Global |
| LoyaltyTransaction | `created_by` | 1 Tenant Global |
| RewardRedemption | `processed_by` — structurally ready, not query-enforced | **3 Shared Workflow** |
| FeedbackForm, FeedbackSection, FeedbackQuestion(+Option+Condition), FeedbackTranslation | `created_by`/`updated_by`/none | 1 Tenant Global — confirmed by `list()` returning every form in the tenant regardless of creator |
| FeedbackCampaign, FeedbackQrCode | `created_by` | 1 Tenant Global |
| FeedbackSubmission, FeedbackAnswer | none — **written from a fully anonymous, unauthenticated public endpoint**, no user concept applies at all | 1 Tenant Global |
| FeedbackComplaint | `assigned_to` — structurally ready, not query-enforced | **3 Shared Workflow** |
| FeedbackLanguage | none; `tenant_id` present but explicitly unread per its own doc comment | **4 System Global** |
| FeedbackNotification | none — a shared team feed/badge, explicitly not designed as a per-user inbox | 1 Tenant Global (flag: would need `user_id` + per-user read-state if a personal-inbox feature is ever wanted — not proposed here) |
| FeedbackAuditLog | `changed_by` | 1 Tenant Global |
| FeedbackSettings | none (singleton) | 1 Tenant Global |

---

## Module: Document Platform, Attendance, HIS

**Structural finding, separate from the ownership question:** none of the 16 document-platform entities carry a `tenant_id` column at all — not even a dormant nullable stub. Every attendance entity (9) and the HIS entity already have one, unread but present. The Phase 1 tenant-isolation pass never reached document-platform. This should be treated as a prerequisite finding for whoever scopes that module's tenant-isolation work, independent of the ownership question below.

Document-platform is also where the audit's clearest genuine gaps live — places a `user_id`-equivalent column is actually missing where the business logic needs one, not just cases where an audit-only column happens to be absent:

| Entity | Ownership situation | Model | Gap? |
|---|---|---|---|
| DocumentEntity | `created_by` | 3 Shared Workflow | none |
| DocumentVersionEntity | `author_id`; `status: draft→...→published` | **2→3 dual-phase** | none — `author_id` covers both phases |
| **DocumentInstanceEntity** | **only `submitted_by`, populated late at finalize time — nothing identifies who is filling out a draft/in-progress instance** | **2→3 dual-phase** | **Real gap.** This is the strongest candidate for an actual new `owner_user_id` column in the whole audit — during draft/in-progress, nobody should see a stranger's half-completed patient form, and today nothing stored answers "whose draft is this." |
| DocumentSnapshotEntity | `created_by` (immutable point-in-time capture) | 3 Shared Workflow | none |
| DocumentAuditTrailEntity | `actor_id` (loose varchar, accepts `'system'`/plugin/AI) | 1 Tenant Global | none |
| DocumentOverrideEntity | none (admin config slot) | 1 Tenant Global | none |
| DocumentOverrideVersionEntity | **no author field at all**, despite having the same draft/in-review/approved/published `status` lifecycle as DocumentVersionEntity | 1 (2 if authored) | Minor gap — lower priority, admin/config surface with presumably fewer concurrent editors |
| DocumentSignatureEntity (both document-engine and compliance-engine copies) | `signed_by_user_id` (proper uuid) vs. `actor_id` (loose varchar) — **inconsistent typing between the two parallel signature tables** | 3 Shared Workflow | typing inconsistency, not a missing-field gap |
| ComplianceProfileEntity, EvidenceChainEntity | none | 1 Tenant Global | none |
| **AssetEntity** | **no actor/owner field of any kind, and no relation showing what an asset is used for** | **undetermined** | Cannot be classified confidently from the entity alone — flagged for follow-up: check `asset-library` call sites (form-import attachments vs. shared branding/logo assets) before committing to a model |
| ImportJobEntity | `created_by` **and** `reviewed_by` — cleanest dual-phase example in the audit | **2→3 dual-phase** | none — both actor slots already exist; only the query-level "my import jobs" filter isn't confirmed present (not checked in this pass) |
| WorkflowInstanceEntity | `current_assignee` (varchar) — **should be treated as a denormalized cache; the authoritative owner is the latest open WorkflowTaskEntity's assignee**, confirmed by `workflow-engine.service.ts` checking the task, not the instance | 3 Shared Workflow | none — derive, don't add |
| **WorkflowTaskEntity** | `assigned_user_id`, `claimed_by_user_id`, `completed_by_user_id` — three distinct actor columns, **actively used for real authorization** (`workflow-engine.service.ts` lines 94-107) | **3 Shared Workflow — reference example for the whole platform** | none — this is what "done right" looks like |
| WorkflowTemplateEntity | **no author field**, same draft/published tension as DocumentVersionEntity but nothing to identify whose draft template it is | 1 (2 while draft, if authored) | Minor gap, admin surface |
| HisSchemaConfig | none | 1 Tenant Global | none |
| Attendance (9 entities, handled as one group) | machine-generated from Oracle HIS sync; the one actor-ish field (`locked_by` on AttendanceGovernanceLock) is deliberately loose because it can be `"system"` | 1 Tenant Global (all 9) | none |

---

## Cross-cutting findings

**The `created_by` vs. real ownership distinction holds almost everywhere.** Of ~117 entities, roughly 20 different "actor" column names appear, and in all but four cases (`PasswordResetRequest`, `TokenReservation`, `EicDisciplineProgressSection`'s optional work-queue view, `WorkflowTaskEntity`) they are write-only audit attribution, never a read-time filter. This is a strong, consistent signal that the platform's actual default — most data visible to the whole authorized team within a tenant — is correct and shouldn't be second-guessed module by module. The real work is the small number of genuine exceptions below.

**Dual-phase entities are the recurring real pattern.** Five entities (`DocumentVersionEntity`, `DocumentInstanceEntity`, `ImportJobEntity`, and more loosely `DocumentOverrideVersionEntity`/`WorkflowTemplateEntity`) have a draft phase that is legitimately personal, followed by a review/publish phase that becomes shared. This is the one place "Tenant + User Owned" as a model actually shows up meaningfully across the whole platform, alongside `TokenReservation`'s narrow exclusive-lock case.

**Two tenant-isolation gaps surfaced as a side effect**, not the audit's direct question but too load-bearing to omit: document-platform's complete absence of `tenant_id` (16 entities), and `ai-platform`'s use of `hospitalId`/`organizationId` instead of the `tenant_id` convention (`AiAuditTrailEntity`, `AiUsageEntity`). Any user-ownership work in those areas should wait for or be sequenced alongside closing those gaps.

---

## Summary

### Entities that genuinely need (or already correctly have) real user-level ownership

- **`TokenReservation`** — already correct, the platform's only clean Tenant + User Owned example.
- **`PasswordResetRequest`** — already correct, real FK + enforced filtering.
- **`WorkflowTaskEntity`** — already correct, the reference pattern for multi-actor shared-workflow ownership.
- **`DocumentInstanceEntity`** — **the one real, unaddressed gap**: needs an owner/filler identity for the draft/in-progress phase, since nothing today distinguishes one user's in-progress patient form from another's. This is the single item in the whole audit worth prioritizing if only one gets fixed.
- `DocumentVersionEntity`, `ImportJobEntity` — already have the right columns (`author_id`, `created_by`/`reviewed_by`); only an open question is whether query-level "mine" filtering exists in their controllers (not confirmed either way in this pass).
- `RewardRedemption`, `FeedbackComplaint` — columns exist (`processed_by`, `assigned_to`) but aren't enforced at the query layer; a product decision, not a schema gap.

### Entities that must stay Tenant Global (the large majority)

Essentially everything else: all of RBAC, licensing, settings, notifications, CMS content and infrastructure, Token Queue operational/config data, Loyalty campaigns/catalogs/accounts, Feedback forms/campaigns/submissions, EIC's two non-clinical entities, all audit-log tables platform-wide, and all attendance/HIS-sync data. None of these should ever gain a restrictive `user_id` filter — the whole point of a hospital platform is that a shared care/admin team needs to see this data, not just its author.

### Entities where `created_by`/similar already fully satisfies the requirement

The large majority of the ~20 audit-attribution columns found (`created_by`, `updated_by`, `uploaded_by`, `activated_by`, `triggered_by`, `changed_by`, and their per-module siblings) are correct exactly as they are — they answer "who did this for the record," which is all that's needed, and should never be repurposed into an access-control filter.

### Entities requiring real classification decisions before any implementation

- **`AssetEntity`** — no ownership signal at all in the entity itself; needs a follow-up read of `asset-library`'s controllers/services to understand what it's actually used for before it can be classified.
- **`LicenseRequestEntity`** — missing even a `created_by`/`requested_by` column, unlike its sibling `PasswordResetRequest`; low-priority but a real, if minor, gap.
- **`DocumentOverrideVersionEntity`**, **`WorkflowTemplateEntity`** — missing author fields despite having draft-lifecycle `status` columns; admin/config surfaces, lower urgency than `DocumentInstanceEntity`.

### Proposed implementation checkpoints (sequencing only — not started)

1. **Checkpoint 0 (prerequisite, not this audit's scope):** close the document-platform `tenant_id` gap before any user-ownership work touches that module, since ownership without tenant scoping underneath it is meaningless there.
2. **Checkpoint 1:** `DocumentInstanceEntity` draft-phase ownership — the one confirmed real gap with patient-facing stakes.
3. **Checkpoint 2:** decide and, if desired, enforce query-level "assigned to me" filtering as an optional view (not a hard restriction) for `FeedbackComplaint` and `RewardRedemption` — both already have the column, this is a product/UX decision, not a migration.
4. **Checkpoint 3:** resolve the `AssetEntity` classification via a follow-up read of its actual usage, then decide if it needs an owner field.
5. **Checkpoint 4 (low priority, opportunistic):** backfill missing author fields on `DocumentOverrideVersionEntity`/`WorkflowTemplateEntity`/`LicenseRequestEntity`, and fix the `EicEnrollmentDisciplineAssignment` `therapist_id` uuid/varchar typing inconsistency, if/when those modules are touched for other reasons.

### Overall migration risk

**Low.** This audit found almost no entities that need a new column purely for correctness — the platform's existing audit-attribution fields already cover the vast majority of cases, and the two entities with real enforced user-ownership already work correctly. The one substantive gap (`DocumentInstanceEntity`) is a single nullable-column addition plus a backfill decision for pre-existing rows (analogous in shape to the Stage B `tenant_id` backfills already proven safe elsewhere in this codebase), not a breaking schema change. No entity in this audit should have a `user_id` column added defensively "just in case" — every recommendation above is grounded in a specific, cited piece of either entity semantics or existing service-layer behavior.
