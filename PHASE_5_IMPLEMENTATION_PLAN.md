# Phase 5 Implementation Plan — Notification Providers

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 5 section — tracks actual execution, matching Phases 2-4's companion-doc pattern.

**Governance carried forward:** continuous implementation, no per-task stop-and-review, architectural blockers only.

**Design directive (2026-07-16, user-specified, supersedes the roadmap doc's literal Phase 5 text):** rather than the roadmap's original plan (a narrow, email-only `IEmailTransport` bolted alongside the existing WhatsApp-only `INotificationTransport`), build one coherent, multi-channel `INotificationProvider` (SMS/WhatsApp/Email/Push) with a structured `NotificationResult` contract, then prove it with a Local and a Cloud implementation. This is a real design deviation from the roadmap document, made explicitly and with reasoning, not silently — recorded here per this project's standing practice of flagging every roadmap deviation.

---

## Pre-flight (2026-07-16)

1. **`INotificationTransport` (Phase 2) already exists and is bound** (`WhatsAppTransport`, wrapping `WhatsAppService`'s real Meta WhatsApp Cloud API integration) — the only channel with a real implementation anywhere in this codebase. `NotificationProcessor`'s `SMS`/`EMAIL` cases were confirmed to be pure stubs (log a warning, return a fake ID, never fail) — matching Phase 2's pre-flight finding that "email was flagged as a genuine gap... no SMTP exists anywhere today," and confirming the same is true for SMS.
2. **Layering decision:** rather than retiring `INotificationTransport`, `INotificationProvider` is layered ON TOP of it — `LocalNotificationProvider.sendWhatsApp()` and `CloudNotificationProvider.sendWhatsApp()` both compose the existing `NOTIFICATION_TRANSPORT` binding rather than reimplementing WhatsApp delivery. Phase 2's transport-level seam stays exactly as useful as it was; Phase 5 only adds channel breadth and a provider-agnostic result shape around it.
3. **Retry-semantics preservation is the trickiest correctness point in this phase.** `NotificationProcessor` previously let `WhatsAppTransport.sendTemplate()`'s thrown errors propagate directly into its own `try/catch`, which re-throws on every attempt so BullMQ's job-retry mechanism keeps retrying. Since `INotificationProvider` methods return a `NotificationResult` instead of throwing, `NotificationProcessor` now explicitly throws when `result.success === false` (`throw new Error(result.errorCode ?? 'Notification send failed')`), preserving the exact same catch/retry/`markFailed` control flow. This was verified by reading `notification.processor.ts`'s full catch block before editing, not assumed.
4. **`sendPush()` has zero existing implementation or wired call path anywhere** — `NotificationChannel` (`notification.types.ts`) is still `'WHATSAPP' | 'SMS' | 'EMAIL'` only; adding a `PUSH` channel value and wiring it into `NotificationProcessor`'s switch would be new capability, not "wrap existing behavior," so it was deliberately left out of this phase's queue-processing path. Both providers still implement `sendPush()` (interface conformance) returning a structured `NOT_IMPLEMENTED` result.
5. **Task 5.3's vendor choice:** picked AWS SES (email) + AWS SNS (SMS) over Twilio/Azure/a second WhatsApp vendor, for two reasons: (a) it reuses the AWS SDK v3 ecosystem Phase 3 already introduced (`@aws-sdk/client-s3` etc.), minimizing new dependency footprint; (b) email and SMS are the two channels with a confirmed, real gap (zero existing implementation) — proving the abstraction against genuinely new capability, not a second redundant integration of an already-working channel. WhatsApp is deliberately shared between Local and Cloud (see item 2 above and the provider's own doc comment) since Meta's Cloud API already *is* "the cloud" for that specific channel.
6. **No live SES/SNS emulator (e.g. LocalStack) was set up for conformance testing** — Task 5.5's suite mocks the AWS SDK clients directly (verifying `CloudNotificationProvider`'s own mapping/error-handling logic) rather than testing against a real service, unlike Phase 3's MinIO-backed live conformance suite. Logged as a deliberate scope difference, not an oversight — no equivalent zero-setup-cost SES/SNS emulator was readily available in this sandbox's time budget.

**Status:** pre-flight complete. Proceeding to implementation.

---

## Task sequencing

1. **Task 5.1 — `INotificationProvider` interface + `NotificationResult`** (`platform/infrastructure/notifications/notification-provider.interface.ts`, new `NOTIFICATION_PROVIDER` DI token in `tokens.ts`). Retry semantics (permanent vs. temporary vs. provider-unavailable/future-fallback) documented directly in the interface's doc comment, per the user's explicit request to define the contract now even though fallback isn't implemented in this phase.
2. **Task 5.2 — `LocalNotificationProvider`**: wraps `NOTIFICATION_TRANSPORT` for WhatsApp, relocates the exact SMS/Email stub logic from `NotificationProcessor` behind the new interface, `sendPush()` returns `NOT_IMPLEMENTED`. `NotificationProcessor` updated to call the provider and translate `NotificationResult` back into a thrown error on failure (preserving retry semantics, see pre-flight item 3).
3. **Task 5.3 — `CloudNotificationProvider`**: real AWS SES email, real AWS SNS SMS, WhatsApp shared with Local, push unimplemented. New env vars: `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`SES_FROM_EMAIL` (required only when `NOTIFICATION_PROVIDER_MODE=cloud`, via Joi `.when()`) and optional `SNS_SENDER_ID`.
4. **Task 5.4 — mode-selection**: `NOTIFICATION_PROVIDER_MODE` (`local`/`cloud`, default `local`) factory in `notification.module.ts`, both providers always registered, byte-for-byte Phase 5.2 wiring preserved for the default path — identical pattern to `StorageModule` (Phase 3) and `LicensingModule` (Phase 4).
5. **Task 5.5 — conformance suite + CI**: mocked-dependency test suite (no live AWS/WhatsApp needed) covering both providers' full interface contract, including the retry-preserving failure-mapping behavior; CI guardrail's `PROVIDER_FILES` allow-list extended with the two new provider files (`notification.module.ts` was already an allowed binder).

---

## Status: ✅ PHASE 5 COMPLETE (2026-07-16)

| Task | Status | Notes |
|---|---|---|
| 5.1 — Interface + NotificationResult | ✅ | Layered on top of Phase 2's `INotificationTransport`, not a replacement |
| 5.2 — LocalNotificationProvider | ✅ | Zero functional change; retry-via-throw semantics explicitly preserved in `NotificationProcessor` |
| 5.3 — CloudNotificationProvider | ✅ | Real SES/SNS; WhatsApp deliberately shared with Local; push unimplemented in both |
| 5.4 — Mode-selection | ✅ | `NOTIFICATION_PROVIDER_MODE`, default `local`, zero behavior change for every current deployment |
| 5.5 — Conformance suite + CI | ✅ | Mocked AWS SDK + mocked transport; runs in the normal unit-test step |

**Follow-ups for a human, outside this session's reach:**
1. Run `npm install` to lock the two new AWS SDK package pins (`@aws-sdk/client-ses`, `@aws-sdk/client-sns`) — same standing caveat as Phase 3's S3 SDK packages.
2. Run the real toolchain's `npm run build`/`test`/`lint`.
3. Consider a LocalStack-backed live conformance suite for SES/SNS (mirroring Phase 3's MinIO approach) if deeper confidence in the AWS SDK integration itself (not just `CloudNotificationProvider`'s own mapping logic) is wanted before a real deployment sets `NOTIFICATION_PROVIDER_MODE=cloud`.
4. `sendPush()` has no wired call path — a future phase would need to add a `PUSH` value to `NotificationChannel` and a case in `NotificationProcessor`'s switch, plus an actual push implementation (e.g. FCM/APNs) in at least one provider, before this channel does anything beyond returning `NOT_IMPLEMENTED`.
5. Provider-unavailable fallback (cloud -> local, or vice versa) is documented in `NotificationResult`'s doc comment as a future capability but is NOT implemented — `retryable: true` today only drives BullMQ's existing same-provider retry, not a cross-provider fallback.
