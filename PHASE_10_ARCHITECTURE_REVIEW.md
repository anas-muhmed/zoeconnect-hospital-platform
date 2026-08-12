# Phase 10 Architecture Review — Tenant Provisioning

**Purpose:** answer the 8 pre-flight questions before writing any Phase 10 code, per the user's explicit request. Grounded in `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 10 section (lines 460-495) and `HDSP_Hybrid_Architecture_Specification_v2.0.md` Section 8.1 (the spec Phase 10's roadmap text explicitly points to), not inferred or invented.

**Headline finding, stated up front:** the roadmap's actual Phase 10 scope is narrower than the four-area vision in the request that prompted this review, most notably on Vendor Portal changes. This is flagged explicitly below (Question 3 and the "Scope fork" section at the end) rather than silently picked one way or the other — the same treatment Phase 6's capability-interface fork got.

---

## 1. Who creates a tenant?

**`TenantProvisioningService`**, a new dedicated Platform-layer service (spec Section 8.1) — explicitly "not folded into `LicensingModule` or `AuthModule`." It runs the 10-step pipeline (Tenant row → subdomain → roles → permissions → settings → storage namespace → Connector pairing key → license → SUPER_ADMIN user → `TenantProvisioned` event).

**Who triggers it:** Task 10.7's own text is explicit — "Admin-facing provisioning API/UI (internal tool, not customer self-service at this stage)." This phase does not build hospital self-service signup. An HDSP operator (internal ops/sales) triggers provisioning through an internal tool. Self-service tenant creation is not named anywhere in Phase 10's task list — it is not scoped here, and this review does not assume it should be.

## 2. Who creates the Connector?

Phase 10 does not create Connector *infrastructure* (that's Task 9.1/9.2's Dockerfile/task-definition, already done) or decide *where* it runs. Phase 10's Task 10.4 (spec step 7) generates a **pairing credential** — "the credential a hospital's deployed Connector instance uses to authenticate." The verb is "generates a key," not "deploys a Connector." Actually standing up a running Connector process at a given hospital (on-prem hardware, an edge VM, or the optional ECS task definition from Phase 9) remains unassigned — this is the same open item Phase 7's Vendor Portal impact analysis carried forward and Phase 9's Connector Dockerfile/task-definition notes repeated again. Phase 10 narrows it slightly (a pairing key now exists to authenticate *whichever* Connector instance eventually connects) but does not resolve who operates the deployment step itself.

## 3. Who owns pairing?

**Credential generation:** `TenantProvisioningService`, HDSP backend, Platform layer (Task 10.4/spec step 7) — same place as every other provisioning step.

**Credential *distribution* to the hospital's Connector operator:** not specified by the roadmap or spec. This is the crux of the scope fork discussed below — the request that prompted this review assumes Vendor Portal becomes responsible for "issuing connector pairing keys" and "showing connector status," but nothing in the roadmap or spec assigns that to Vendor Portal, or to Phase 10 at all. The spec's Section 11 (CI/CD) only says Connector images are "distributed to hospital-side agents via the pairing mechanism from Section 8.1 step 7" — describing that a mechanism exists, not which system's UI exposes it to a human.

**Trust establishment mechanics** (how the key is actually verified at connect time, e.g. does `RedisMessageTransport`/the Connector protocol check it, or is it just a Secrets-Manager-stored value the hospital's operator copies into their Connector's env vars manually) — not specified anywhere read so far. `connector/src/protocol/message-transport.interface.ts` (Phase 6) has no auth/credential field in its request/response shapes today. This is a real, unresolved protocol question, not just a business-process one — building Task 10.4 correctly likely requires a small Connector protocol extension (or explicit reliance on Redis's own auth token, i.e. the pairing key literally *is* a scoped `CONNECTOR_REDIS_URL`/Redis ACL credential rather than an application-level handshake). Worth deciding explicitly before Task 10.4, not discovered mid-implementation.

## 4. When is Oracle verified?

Not part of Phase 10's pipeline at all — none of the 10 steps in spec Section 8.1 touch Oracle connectivity. This is consistent with the whole project's standing separation: Oracle verification is the Connector's/`DirectOracleTransport`'s concern at *connection* time (existing circuit-breaker/health-check machinery from Phases 2, 6, 7), not a provisioning-pipeline step. A newly-provisioned cloud tenant reaches "Ready" (step 10) with a pairing key generated but no guarantee a Connector has even connected yet, let alone that Oracle is reachable through it — this is intentional per the spec's degrade-gracefully posture (Oracle is "optional" everywhere else in this codebase; Phase 10 doesn't special-case tenant creation to require it upfront).

## 5. When is subscription activated?

Step 8 (Task 10.5): "Issue initial License (via `SubscriptionLicenseProvider` — starts in **trial** status per existing trial-mode semantics)." Not "activated" in a billing sense — a real subscription (paid, Stripe-backed) is out of scope here too. Recall Phase 4's own text: `SubscriptionLicenseProvider` "stops at reading tenant license status from a DB table... proving the interface, not yet building billing." Phase 10 uses that same not-yet-billing-integrated provider to seed a trial-status row. Real subscription *activation* (a paying customer flips from trial to active) still has no defined mechanism anywhere in the roadmap read so far — likely a Vendor Portal or billing-webhook concern for a later phase, not named explicitly.

## 6. Can onboarding resume after failure?

Yes, by explicit design requirement — spec Section 8.1: "Each step is idempotent and independently retryable... built on the existing Workflow-engine primitives already present in `document-platform` rather than inventing a second workflow mechanism. Failure at any step must leave the tenant in a clearly-flagged incomplete state, never a half-provisioned tenant silently exposed to login attempts." The roadmap's own Task 10.1 and the "Risks" section restate this ("mitigated by the idempotent/resumable design... verified by testing deliberate failure injection at each step"), and the Rollback strategy section calls for "a companion de-provisioning path (worth building as part of Task 10.1, not an afterthought)."

**What this means concretely for implementation:** the Document Platform's existing workflow engine (Milestone 1, per `app.module.ts`'s comment "Document Engine only") needs to be read in detail before Task 10.1 — resuming after failure is a property of *that* engine's step/state persistence model, not something `TenantProvisioningService` can bolt on independently. This is the single biggest technical unknown for Task 10.1 and needs its own focused read before implementation, not assumed to "just work" because the spec says to use it.

## 7. What is the source of truth?

The `Tenant` row itself (HDSP backend's own Postgres, `tenant` table, Phase 1) for "does this tenant exist and what state is it in" — every other step (roles, permissions, settings, storage prefix, pairing key, license, admin user) is scoped to that row's `tenant_id`/generated UUID. The **provisioning pipeline's own run state** (which step succeeded, which is pending, where a resume should pick up) needs its own source of truth distinct from the `Tenant` row — presumably the Document-Platform workflow engine's own run/step-state tables, per Question 6's answer, though this needs confirming by reading that engine's actual schema before Task 10.1, not assumed.

Vendor Portal's `Hospital`/`IssuedLicense`/`LicenseRequest` entities (confirmed present at `vendor-portal/backend/src/modules/hospitals/entities/`) are a **separate, pre-existing source of truth for a different thing** — the self-hosted one-time vendor-registration/licensing flow (`SetupController.setupVendorRegistration`, `VendorSyncService`), not cloud tenant provisioning. Phase 10 does not merge these two systems; conflating them is exactly the kind of scope creep the fork below warns about.

## 8. What is reversible?

Per the roadmap's Rollback strategy: "since this phase only creates new tenants, it carries no risk to any existing tenant's data" — provisioning is purely additive at the platform level. Within a single provisioning run: an incomplete/failed run is either resumed (Question 6) or explicitly torn down via "a companion de-provisioning path" the roadmap says should be built as part of Task 10.1. Full tenant lifecycle operations beyond initial creation/rollback — suspend, reactivate, rename, change subdomain, rotate the Connector pairing key, handle subscription expiry — are **not named anywhere in Phase 10's 8 tasks**. This is the second major component of the scope fork below.

---

## Scope fork — roadmap-literal Phase 10 vs. the four-area vision

Two of the four areas from the request that prompted this review are not supported by the roadmap or spec text as Phase 10 work:

| Area | Roadmap-literal Phase 10 (Tasks 10.1-10.8) | Four-area vision |
|---|---|---|
| Tenant creation | ✅ `TenantProvisioningService`, 10-step pipeline, internal admin-only UI (Task 10.7) | ✅ Same core idea, described in more product-facing terms |
| Connector onboarding | Only "generate a pairing key" (Task 10.4/step 7). No pairing *protocol*, no rotation, no re-pairing, no offline-detection lifecycle named. | A full trust/rotation/offline/re-pairing lifecycle — none of which is in the roadmap's task list |
| Vendor Portal integration | **Not mentioned in Phase 10 at all.** "no changes to existing Business modules"; Task 10.7 is an internal tool, explicitly *not* Vendor Portal self-service. Two open items carried forward from Phase 7 (Connector provisioning ownership, `testDbConnection()`'s direct-connectivity assumption) remain open questions, not scoped implementation tasks. | Vendor Portal gains tenant creation, subscription assignment, pairing-key issuance UI, hospital onboarding, connector status display, license activation |
| Tenant lifecycle | Not named — Phase 10 is creation (+ resume/rollback of a failed creation) only | Suspend, reactivate, delete, rename, change subdomain, rotate secrets, regenerate connector credentials, subscription expiry |

**Recommendation:** implement roadmap-literal Phase 10 first (Tasks 10.1-10.8 as specified), for the same reasons the Phase 6 fork was resolved that way — it's what's actually documented and reviewable, it doesn't touch a second repository without a scoped task calling for it, and the harder unresolved question (who owns Connector pairing/distribution end-to-end) is explicitly still open at the spec level, not something to resolve unilaterally inside a single implementation pass. The four-area vision's Connector-lifecycle and Vendor-Portal items are real, legitimate future work — they're just not *this* roadmap phase's defined scope, the same way Phase 6's capability interfaces were real and legitimate but not that phase's defined scope.
