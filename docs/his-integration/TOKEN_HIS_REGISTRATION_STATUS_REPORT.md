# Token Management ↔ HIS Registration Integration — Implementation Status Report

**Scope:** the iframe-embedded "Token Assignment / Registration Widget" that links an HDSP kiosk token to a patient's HIS registration, without modifying the HIS backend.

**Method:** direct inspection of the HDSP repository (`D:\HDSP`). The HIS Java/JSF codebase itself is **not present in this repository** — only HDSP-side integration artifacts (docs, an Nginx snippet, two XHTML patch files meant to be pasted into HIS) exist here. Any claim below about "the HIS side" is limited to what these artifacts describe, not verified HIS source code.

Every claim is backed by a specific file and line reference so it can be re-checked.

---

## 1. Architecture

The design is a **same-origin iframe embed**, not an API integration:

1. **Nginx** on the HIS server proxies a new path prefix `/hdsp/` to the HDSP Next.js frontend (`docs/his-integration/nginx-hdsp-widget.conf`), so the widget is served from the *same origin* as the HIS page. This avoids CORS and lets `X-Frame-Options: SAMEORIGIN` remain intact.
2. A JSF/XHTML snippet (`docs/his-integration/registration-widget-integration.xhtml`) adds an `<iframe>` to the HIS registration screen pointing at `/hdsp/widget/registration?branchId=...&token=...`, with `sandbox="allow-scripts allow-same-origin allow-forms"`.
3. The HDSP frontend serves that iframe from `frontend/src/app/widget/registration/page.tsx` — a dedicated, chromeless page (no HDSP sidebar/header) that shows a live "waiting tokens" queue.
4. The widget authenticates against the normal HDSP NestJS backend (`backend/src/modules/token/registration/registration.controller.ts`), guarded by the same `JwtAuthGuard` + `PermissionsGuard` + `@RequirePermissions(...)` system used everywhere else in HDSP — there is **no separate HIS-specific auth mechanism**, and no `@Public()` endpoints in this controller.
5. Communication between the iframe and the HIS parent page is **one-directional only, and only partially implemented** (see §2 and §8): the HIS page is documented to `postMessage` a `HIS_PATIENT_REGISTERED` event into the iframe once registration completes; the widget listens for it and calls the mapping API. There is **no message sent back out** from the widget to the parent — the widget's own header comment says so explicitly (`frontend/src/app/widget/registration/page.tsx:14`).
6. Data is persisted in three new Postgres tables (`token_reservations`, `token_patient_mapping`, `mapping_audit_log`) plus new columns on the existing `token_records` table — see §5.

No database changes, servlet filters, or Java classes were added on the HIS side (none exist in this repo, and the docs describe zero backend HIS changes — only a client-side XHTML/JS snippet).

---

## 2. HIS Integration

**No HIS source files were found or modified in this repository.** What exists here are three integration *artifacts* meant to be applied to a HIS codebase that lives elsewhere:

| File | Purpose |
|---|---|
| `docs/his-integration/nginx-hdsp-widget.conf` (46 lines) | Nginx `location /hdsp/` block proxying to the HDSP frontend (port 3000), with SSE-friendly settings (`proxy_buffering off`, 1-hour `proxy_read_timeout`). Contains a commented-out optional direct API passthrough to the backend (port 3001). |
| `docs/his-integration/registration-widget-integration.xhtml` (104 lines) | A generic JSF snippet: the `<iframe id="hdspTokenWidget" src="/hdsp/widget/registration?branchId=#{hdspSessionBean.branchId}&token=#{hdspSessionBean.accessToken}">`, plus a JS function `notifyHdspWidget(hisPatientId, mrn, patientName, visitId)` that `postMessage`s `{type: 'HIS_PATIENT_REGISTERED', ...}` into the iframe. Includes a commented-out example of wiring it to an `<a4j:commandButton oncomplete="...">`. |
| `docs/his-integration/registrationflow-widget-patch.xhtml` (112 lines) | A **patch targeted at a specific file, `registrationFlowForm.xhtml`, which does not exist in this repository.** Adds the same bridge function, plus a `window.addEventListener('message', ...)` **on the HIS/parent side** that listens for `HDSP_TOKEN_RESERVED` / `HDSP_TOKEN_RELEASED` events from the widget, and a fixed 340px-wide right-side panel layout. |

**No managed beans, Java classes, or servlet filters exist in this repo** — `#{hdspSessionBean.branchId}` / `#{hdspSessionBean.accessToken}` are referenced by the XHTML snippet but the bean itself (`hdspSessionBean`) is not defined anywhere here. Its existence and correctness cannot be verified from this repository.

**How the iframe is injected:** per the docs, a single `<iframe>` tag is pasted into the existing HIS registration page, sized/positioned by the accompanying CSS in the patch file; no other HIS page structure changes are documented.

**Contract mismatch found:** `registrationflow-widget-patch.xhtml` expects the widget to `postMessage` `HDSP_TOKEN_RESERVED` / `HDSP_TOKEN_RELEASED` events, but the actual widget frontend code never sends any `postMessage` to `window.parent` (confirmed by reading `frontend/src/app/widget/registration/page.tsx` and `frontend/src/lib/hooks/useRegistrationWidget.ts` in full — no `postMessage(` calls exist in either). The HIS-side listener this patch installs currently has nothing to listen to.

---

## 3. HDSP Frontend

**Widget pages** (all under `frontend/src/app/widget/registration/`):
- `page.tsx` (193 lines) — main widget shell, reads `branchId` and `token` from the URL, renders one of: missing-params error, queue list, confirm dialog, "reserved / waiting for HIS" banner, "mapping in progress" spinner, or success banner, based on a client-side state machine.
- `layout.tsx` (13 lines) — just a `<Suspense>` wrapper.
- `components/QueueList.tsx`, `ConfirmDialog.tsx`, `ReservedBanner.tsx`, `SuccessBanner.tsx` — presentational pieces for each state.
- `frontend/src/lib/hooks/useRegistrationWidget.ts` (323 lines) — all the state-machine and networking logic.
- `frontend/src/lib/api/registration.api.ts` (105 lines) — the typed API client.

**State machine:** `IDLE → SELECTED → CONFIRMING → RESERVING → RESERVED → MAPPING → MAPPED` (with an `ERROR` state reachable from most points).

**How waiting tokens are loaded:** the hook prefers a live SSE connection (`new EventSource('/token/registration/queue/stream?branchId=...')`), and falls back to polling `GET /token/registration/queue` every 8 seconds if the SSE connection errors (`useRegistrationWidget.ts:103-112` region). The backend SSE handler pushes a fresh queue snapshot every 5 seconds.

**How staff selects a patient:** the receptionist taps a token in `QueueList`, which moves the state machine to `SELECTED`; tapping "Register {token}" opens `ConfirmDialog` (state `CONFIRMING`), and confirming calls `POST /token/registration/:tokenNumber/reserve` with a client-generated `reservationId` (`crypto.randomUUID()`), moving to `RESERVED`. While reserved, the widget sends a heartbeat (`POST .../heartbeat`) every 10 seconds to keep the 30-second server-side reservation window alive, and shows the `ReservedBanner` while it waits for the HIS page to finish its own registration flow and fire `postMessage`.

**How the assignment is saved:** when the widget receives `window.postMessage({type: 'HIS_PATIENT_REGISTERED', hisPatientId, mrn, patientName, visitId})` from the parent HIS page, it calls `registrationApi.mapPatient(...)`, moving to `MAPPING` then `MAPPED` on success, showing `SuccessBanner`. A second, optional call (`mapVisit`) can attach a `visitId` later if it wasn't available at mapping time.

**Permissions used by the UI:** none are checked client-side beyond what the backend enforces (`TOKEN:REGISTRATION:VIEW` to see the queue, `TOKEN:REGISTRATION:ACTION` to reserve/map). There is no role-gating UI logic in the widget itself — it assumes the person embedded in the HIS page already has an appropriately-permissioned HDSP account.

**Reliability details:** on `beforeunload`, the widget best-effort releases its reservation via `navigator.sendBeacon`. A 15-second cron job on the backend (`registration.service.ts:437`, `sweepExpiredReservations`) expires stale reservations server-side as a backstop.

---

## 4. Backend APIs

All under `RegistrationController` (`backend/src/modules/token/registration/registration.controller.ts`), class-level `@Controller('token/registration')` + `@UseGuards(JwtAuthGuard, PermissionsGuard)`.

| Endpoint | Method | Permission | Request | Response | Purpose | Status |
|---|---|---|---|---|---|---|
| `/token/registration/queue` | GET | `TOKEN:REGISTRATION:VIEW` | `?branchId=` | `QueueToken[]` | List WAITING/CALLED tokens, excluding tokens another user has reserved | ✅ Implemented |
| `/token/registration/queue/stream` | GET (SSE) | `TOKEN:REGISTRATION:VIEW` | `?branchId=` | `text/event-stream`, `{type:'QUEUE_UPDATE', tokens, ts}` every 5s | Live queue push | 🟡 Implemented but **effectively non-functional as wired** — see §8, finding 3 |
| `/token/registration/:tokenNumber/state` | GET | `TOKEN:REGISTRATION:VIEW` | path param | `{tokenRecord, mapping, reservation}` | Confirm-dialog detail fetch | ✅ Implemented |
| `/token/registration/:tokenNumber/reserve` | POST | `TOKEN:REGISTRATION:ACTION` | `{reservationId}` | `ReservationResult` | Soft-lock a token while staff completes HIS-side registration | ✅ Implemented |
| `/token/registration/:tokenNumber/heartbeat` | POST | `TOKEN:REGISTRATION:ACTION` | `{reservationId}` | `{expiresAt}` | Extend the 30s reservation window | ✅ Implemented |
| `/token/registration/:tokenNumber/reserve` | DELETE | `TOKEN:REGISTRATION:ACTION` | `{reservationId}` | 204 | Release a reservation | ✅ Implemented |
| `/token/registration/map/patient` | POST | `TOKEN:REGISTRATION:ACTION` | `{tokenNumber, hisPatientId, mrn, patientName?, visitId?}` | `PatientMapping` (201) | **The actual linking step** — inserts mapping, flips token to `REGISTERED`, releases reservation, writes audit log, all in one DB transaction | 🔴 **Unreachable from the frontend as currently wired — see §8, finding 1 (critical)** |
| `/token/registration/map/visit` | POST | `TOKEN:REGISTRATION:ACTION` | `{tokenNumber, visitId}` | `PatientMapping` (200) | Attach/update `visitId` after Stage 1 | 🔴 **Same unreachability issue — see §8, finding 1** |
| `/token/registration/:tokenNumber/supervisor-reset` | PATCH | `TOKEN:REGISTRATION:SUPERVISOR_RESET` | `{targetStatus, reason}` | updated token | Undo an incorrect registration, put the token back in the active queue | 🟡 Implemented, but writes suspect columns — see §8, finding 2 |

**Note on the two "map" endpoints:** the controller JSDoc explicitly (and incorrectly) documents these as `POST /token/map/patient` and `POST /token/map/visit` (`registration.controller.ts:152,170`) — i.e., *without* the `registration` segment. This is not just a comment error; it matches a real bug in the frontend caller. See §8.

---

## 5. Database

Three migrations touch this feature (`backend/src/database/migrations/`):

**1. `1751800000001-AddRegistrationColumnsToTokenRecords.ts`** — alters the existing `token_records` table:
- Extends its status CHECK constraint to add `'REGISTERED'`.
- Adds columns: `registered_at`, `registration_user`, `supervisor_reset_at`, `supervisor_reset_by`, `supervisor_reset_note`.
- Adds two partial indexes to support the new status.

**2. `1751800000002-CreateRegistrationMappingSchema.ts`** — creates three new tables:

- **`token_reservations`** — the soft-lock mechanism, explicitly documented as "a technical mechanism, not a business state" (`token-reservation.entity.ts`). Columns: `id` (PK), `token_record_id` (FK → `token_records`, `ON DELETE CASCADE`), `token_number`, `reservation_id` (client-generated UUID), `reserved_by_user`, `reserved_at`, `expires_at`, `last_heartbeat_at`, `released_at` (nullable), `release_reason` (nullable).

- **`token_patient_mapping`** — the actual linkage record, documented as "never deleted." Columns: `id` (PK), `token_record_id` (FK → `token_records`, `ON DELETE RESTRICT`, **unique** — one mapping per token), `token_number`, `his_patient_id`, `mrn`, `patient_name` (nullable), `visit_id` (nullable), `mapped_by`, `mapped_at`, `visit_mapped_at` (nullable), `registration_completed_at`, `metadata` (jsonb, default `{}`), `created_at`, `updated_at`.

- **`mapping_audit_log`** — append-only trail, documented "never update or delete rows." Columns: `id` (PK), `token_record_id` (FK, `ON DELETE SET NULL`), `mapping_id` (FK → `token_patient_mapping`, `ON DELETE SET NULL`), `event_type` (union of 8 values), `old_status`, `new_status`, `actor`, `ip_address` (inet), `payload` (jsonb, default `{}`), `created_at`.

Also adds 4 new permissions (`TOKEN:REGISTRATION:VIEW/ACTION/SUPERVISOR_RESET`, plus one more per the earlier research pass) and 2 new roles (`TOKEN_RECEPTIONIST`, `TOKEN_SUPERVISOR`).

**3. `1783326737784-ConsolidateRecentChanges.ts`** — a later consolidation pass normalizing timestamp types and FK constraint names on these same tables; confirms they are still live in the current schema (not since dropped/reverted).

**⚠️ Entity/schema mismatch found (see §8, finding 2):** the `token_records` table has the five new columns from migration 1 (`registered_at`, `registration_user`, `supervisor_reset_at`, `supervisor_reset_by`, `supervisor_reset_note`), but the corresponding TypeORM entity class, `backend/src/modules/token/entities/token-record.entity.ts`, was **never updated to declare these as `@Column()` properties.** The service code that writes them (`registration.service.ts:257-261` and `:395-399`) does so via `em.update(TokenRecord, ..., { registered_at: now, registration_user: userId } as any)` — a raw object literal with snake_case keys and an explicit `as any` cast bypassing TypeScript's type checking specifically because these properties don't exist on the class. Whether TypeORM's query builder resolves these correctly at runtime against unmapped columns could not be verified without a live database — this needs to be tested, not assumed to work.

---

## 6. Registration Status Tracking

**What HDSP can currently determine, and how:**

| Milestone | Mechanism | Status |
|---|---|---|
| Patient arrived at HDSP kiosk / token issued | `TokenRecord.status = 'WAITING'`, created by kiosk issuance flow (unrelated module) | ✅ Working (pre-existing) |
| Token called at counter | `TokenRecord.status = 'CALLED'` (pre-existing token-call flow) | ✅ Working (pre-existing) |
| **Registration completed** | `TokenRecord.status = 'REGISTERED'` + a row in `token_patient_mapping`, set by `mapPatient()` | 🔴 Cannot currently be reached in practice — see §8, finding 1 |
| Waiting for consultation | **No such state exists.** `TokenStatus` union has no "waiting for doctor" / "in consultation" value | 🔴 Not implemented |
| Consultation completed | **No such state or module exists** | 🔴 Not implemented |
| Eligible for pharmacy | **No such state, module, or downstream trigger exists** | 🔴 Not implemented |

**The entity's own documented state machine** (`token-record.entity.ts:20-27`, a code comment) is:
```
WAITING → CALLED → SERVING → COMPLETED
WAITING → ON_HOLD → WAITING
WAITING → CANCELLED | SKIPPED
CALLED  → MISSED (no-show)
MISSED  → RECALLED → CALLED
* → REISSUED
```
Note that **`REGISTERED` does not appear in this comment at all**, even though it's a valid value in the `TokenStatus` TypeScript union (`token-record.entity.ts:9-12`) added by migration 1. The state machine documentation was not updated when the registration feature was added, and there is no code enforcing a specific transition order into/out of `REGISTERED` beyond the one guard in `mapPatient()` that rejects mapping an already-`REGISTERED` token.

**Beyond registration, there is no further state tracking of any kind.** No module in this codebase represents "consultation," "doctor queue," or "pharmacy readiness" (confirmed by listing `backend/src/modules/` — see §8 and §10).

---

## 7. Current Workflow (as implemented today, including where it breaks)

```
Patient
  │
  ▼
Kiosk (frontend/src/app/kiosk/[slug]/page.tsx or token/kiosk/[code]/page.tsx)
  │  POST /token/queue/kiosk/:slug/issue
  ▼
Token Created  ── TokenRecord{status: WAITING}  [✅ working, pre-existing]
  │
  ▼
Patient walks to Registration Counter
  │
  ▼
HIS Registration Screen  [⚠️ actual HIS-side code not in this repo — cannot verify]
  │  loads <iframe src="/hdsp/widget/registration?branchId=..&token=..">
  ▼
iframe (frontend/src/app/widget/registration/page.tsx)
  │  GET /token/registration/queue  (or SSE .../queue/stream)
  ▼
Staff selects the patient's waiting Token
  │  POST /token/registration/:tokenNumber/reserve   [✅ works, IF the widget can authenticate — see below]
  ▼
Staff completes registration in the HIS's own screen (outside the iframe)
  │  HIS fires: iframe.contentWindow.postMessage({type:'HIS_PATIENT_REGISTERED', ...})
  ▼
Widget receives postMessage
  │  registrationApi.mapPatient(...)  →  POST /token/map/patient
  │
  X  ◄── BREAKS HERE: this request 404s. The route is actually mounted at
  │      /token/registration/map/patient (class-level controller prefix),
  │      not /token/map/patient. See §8 finding 1b.
  │
  ▼ (if this were fixed)
Assignment Saved  ── token_patient_mapping row + TokenRecord.status='REGISTERED'
  │
  ▼
Registration Completed  ── HDSP now knows this patient registered
  │
  X  ◄── NO FURTHER PATH EXISTS. Nothing in this codebase reads
  │      TokenRecord.status='REGISTERED' or queries token_patient_mapping
  │      outside the registration module itself (confirmed by repo-wide
  │      grep — zero references elsewhere).
  ▼
Doctor Queue   — module does not exist in this codebase
  ▼
Pharmacy Queue — module does not exist in this codebase
```

**Two independent breaks exist before any "downstream" step could even be reached** — see §8 for full detail. The diagram above shows both: the widget likely cannot authenticate its requests at all (finding 1a), and even if it could, the actual mapping call is sent to a URL that doesn't match the registered route (finding 1b).

---

## 8. Remaining Work

### Finding 1 (🔴 Critical — blocks the entire feature end-to-end)

**1a. The receptionist's JWT is never actually attached to any widget request.**
- The widget reads the `token` URL param into a local variable `accessToken` (`frontend/src/app/widget/registration/page.tsx:31`) and passes it into `useRegistrationWidget({branchId, accessToken})`.
- Inside `useRegistrationWidget.ts`, that `accessToken` parameter is **declared and never referenced again anywhere else in the 323-line file** (verified by grep — no `setAuth`, no `useAuthStore`, no `Authorization` usage tied to it).
- All API calls go through the shared `apiClient` (`frontend/src/lib/api/client.ts`), whose request interceptor (`client.ts:38-40`) attaches `Authorization: Bearer ${token}` from **`useAuthStore.getState().token`** — the normal, sessionStorage-persisted HDSP login store, which the widget never populates.
- **Net effect:** every request the widget makes (`GET /queue`, `POST /reserve`, `POST /map/patient`, etc.) will carry no Authorization header (or a stale/unrelated one, if the browser happens to have another HDSP tab logged in on the same origin) and will be rejected by `JwtAuthGuard` with 401, in the deployment scenario the docs describe (HIS injects the receptionist's token via URL).

**1b. The mapping endpoints are called at the wrong URL.**
- `registration.api.ts:95` calls `apiClient.post('/token/map/patient', payload)` and `registration.api.ts:102` calls `apiClient.post('/token/map/visit', ...)` — both **hardcoded, bypassing the file's own `BASE = '/token/registration'` constant** that every other call in the same file correctly uses.
- The backend controller is `@Controller('token/registration')` with method routes `@Post('/map/patient')` and `@Post('/map/visit')` (`registration.controller.ts:158,176`). In NestJS, a controller's class-level prefix is always joined with method-level route paths — a leading slash on the method path does **not** escape the class prefix. The real, registered route is `POST /token/registration/map/patient`, not `POST /token/map/patient`.
- **Net effect:** even if 1a were fixed, the single most important call in the whole feature — the one that actually links the token to the patient — is sent to a URL Nest never registered, and will 404.

Both of these must be fixed before this feature can function in any real deployment. Given neither has apparently been caught yet, **it's unlikely this integration has been tested end-to-end against an actual embedded iframe**, only unit/component-level in isolation.

### Finding 2 (🟡 Needs verification — data-integrity risk)

`registration.service.ts` writes to `TokenRecord` fields that don't exist on the `TokenRecord` TypeORM entity class:
- `mapPatient()`, lines 257-261: `em.update(TokenRecord, {id}, {status, registered_at, registration_user} as any)`
- `supervisorReset()`, lines 395-399: same pattern with `supervisor_reset_at`, `supervisor_reset_by`, `supervisor_reset_note`

`token-record.entity.ts` has no `registeredAt`, `registrationUser`, `supervisorResetAt/By/Note` properties at all, despite the DB columns existing (migration 1). The `as any` casts are a strong signal the original author hit a TypeScript error here and suppressed it rather than fixing the entity. Whether TypeORM's `update()` still writes these columns correctly at runtime against unmapped metadata could not be confirmed without executing against a live database — **this needs an actual integration test, not just a code read**, before relying on `registered_at`/`registration_user` for any reporting or audit purpose.

### Finding 3 (🟡 Partially working — live queue push is likely dead code in practice)

The SSE endpoint (`GET /token/registration/queue/stream`) is guarded by the same `JwtAuthGuard`. The frontend connects to it using the browser's native `EventSource` API (`useRegistrationWidget.ts:112`, `new EventSource(url, {withCredentials: false})`), which **cannot set custom headers** (no way to send `Authorization: Bearer ...`). Independent of finding 1a, this means the SSE connection will fail authentication and the widget will fall back to 8-second polling every time — the "Live" indicator in the UI (`page.tsx:114-118`) is therefore misleading in the current implementation; there is no actual push-based live update path today.

### Finding 4 (🔴 Not implemented — contract mismatch with the HIS-side doc)

`docs/his-integration/registrationflow-widget-patch.xhtml` installs a `window.addEventListener('message', ...)` on the HIS/parent page expecting `HDSP_TOKEN_RESERVED` and `HDSP_TOKEN_RELEASED` events from the widget (e.g. to update HIS-side UI or session storage). **No code anywhere in the widget frontend sends these** — confirmed by a full read of both `page.tsx` and `useRegistrationWidget.ts`; the widget's own header comment documents this as "reserved for future error signalling," i.e. explicitly not built yet.

### Finding 5 (🔴 Not implemented — everything past "Registration Completed")

- No Doctor/Consultation module exists in `backend/src/modules/`.
- No Pharmacy module exists.
- No "Patient Journey" tracking module exists.
- Nothing outside `token/registration` itself reads `TokenRecord.status='REGISTERED'` or queries `token_patient_mapping` (confirmed by a repo-wide grep for `TokenPatientMapping`/`token_patient_mapping` — zero hits in `token/analytics`, `token/queue`, `token/kiosk`, `loyalty/**`, `his/**`, or anywhere in the frontend outside the widget's own API client).
- The Loyalty module exists and has its own separate HIS bridge, but is entirely unrelated to and unaware of this registration-linking feature.

### Other gaps
- No automated tests were found for the registration module, the widget, or the HIS integration docs (not checked exhaustively, but none surfaced during this pass).
- The HIS-side half of this integration (the actual JSF page changes, the `hdspSessionBean`, and the `oncomplete` wiring shown only as a commented-out example) exists only as documentation/patch files here — its real-world correctness is entirely unverified from this repository.

---

## 9. Code Quality Review

- **Architectural issue — dual "source of truth" risk avoided, but barely.** The design correctly keeps `token_reservations` explicitly documented as "not a business state," separate from the durable `token_patient_mapping` record — a good separation of concerns that avoids conflating a soft UI lock with a real fact. This part is well thought out.
- **Type-safety bypass (finding 2 above)** — using `as any` to write properties that don't exist on the target entity is a real maintainability hazard: a future refactor of `TokenRecord` could silently break registration-status writes with no compiler warning, since the write path is invisible to TypeScript.
- **Duplicated logic** — the entity-mismatch `as any` pattern is duplicated verbatim in two places (`mapPatient` and `supervisorReset`); a single typed helper (or, better, adding the missing entity columns) would remove both instances of the risk at once.
- **Inconsistent base-path usage** — `registration.api.ts` correctly uses a `BASE` constant for 7 of its 9 calls but hardcodes the other 2 (`mapPatient`, `mapVisit`) without it — this inconsistency is precisely what produced finding 1b. A lint rule or code review checklist item ("no literal `/token/...` paths outside the `BASE` constant") would have caught this.
- **Race condition — none new found in the reservation/mapping flow itself.** The `mapPatient()` transaction (insert mapping + update status + release reservation + audit log, all in one `dataSource.transaction`) is correctly atomic, and the unique constraint on `token_patient_mapping.token_record_id` prevents a duplicate-mapping race at the DB level even under concurrent requests.
- **Security** — permission checks are consistently applied via the standard `PermissionsGuard`/`@RequirePermissions` pattern; no `@Public()` bypass exists on this controller. The iframe `sandbox` attribute in the docs (`allow-scripts allow-same-origin allow-forms`) is reasonably restrictive. The core exposure risk is currently the opposite of "too open" — the auth wiring gap (finding 1a) means the feature is presently **too broken to test**, not insecure.
- **Performance** — the SSE 5-second push interval and 8-second polling fallback are both reasonable for a low-frequency registration-desk workflow; no obvious performance concerns at the current scale this is designed for.
- **Maintainability — documentation drift.** Two separate, out-of-sync sources of truth exist for "what does the widget send back to HIS": the widget's own comment ("none currently") and the HIS-side patch file's listener (expecting two specific event types). Neither the code nor docs reference the other, so a future engineer reading only one side would get an incomplete/wrong picture. The `TokenRecord` state-machine comment is similarly stale (doesn't mention `REGISTERED` at all).

**Suggested improvements, roughly in priority order:**
1. Fix the two-line `BASE` prefix bug in `registration.api.ts` (finding 1b) — trivial, highest impact.
2. Wire the URL `token` param into an authenticated request path for the widget specifically (finding 1a) — likely needs either (a) writing it into the auth store on mount, or (b) a dedicated Axios instance for the widget that doesn't depend on the shared session store at all, since the widget's "session" is really just a one-shot token injected per iframe load, not a normal login.
3. Add the missing columns to the `TokenRecord` entity class and remove the `as any` casts (finding 2).
4. Either implement the outbound `postMessage` the HIS-side patch expects, or update that patch file to stop listening for events that will never arrive (finding 4) — pick one source of truth and make the other match it.
5. Replace `EventSource` with a fetch-based SSE client that can attach an Authorization header (or move to a cookie-based auth path for this specific route) if live push is actually wanted (finding 3); otherwise, simplify by removing the SSE path entirely and just polling, to reduce complexity for a feature that isn't currently delivering its intended benefit.

---

## 10. Production Readiness

| Component | Status | Estimate | Basis |
|---|---|---|---|
| HIS iframe integration (HIS-side XHTML/JS) | 🟡 Partially Complete | ~40% | Docs/patch exist and describe a coherent approach, but reference a `hdspSessionBean` and a target file (`registrationFlowForm.xhtml`) not present or verifiable in this repo; the `oncomplete` wiring is shown only as a commented-out example, not confirmed applied anywhere real. |
| Token assignment widget UI | 🟡 Partially Complete | ~75% | Full state machine, all screens, reservation heartbeat/expiry, and graceful degradation (SSE→polling) are implemented and appear well-designed. Undermined by the auth-wiring gap that likely prevents it from working when actually embedded per the documented deployment. |
| Backend APIs | 🟡 Partially Complete | ~85% (as code) / **effectively 0% reachable today** | Every endpoint the feature needs is implemented, transactionally sound, and permission-guarded. But the two calls the frontend actually makes for the core "link" step don't match the registered routes (finding 1b), and the SSE endpoint can't be authenticated by the client that calls it (finding 3). |
| Database | 🟡 Partially Complete | ~90% | Schema is well-designed (proper FKs, audit trail, correct separation of reservation vs. mapping). Docked for the entity/column mismatch on `token_records` (finding 2), which is a real risk even if migrations themselves are correct. |
| Registration status tracking | 🟡 Partially Complete | ~50% | The `REGISTERED` status and mapping table are real and would work once findings 1a/1b are fixed — but nothing downstream reads this status, and the state-machine documentation wasn't updated to include it. |
| Queue synchronization (HDSP ↔ HIS) | 🔴 Not Implemented | ~15% | Only the "widget sees the HDSP-side queue" direction exists. There is no synchronization of HIS-side registration queue state back into HDSP beyond the single postMessage-triggered mapping call, and that call currently can't succeed (findings 1a/1b). |
| Pharmacy readiness | 🔴 Not Implemented | 0% | No pharmacy module, no state, no trigger of any kind exists in this codebase. |
| Doctor Queue | 🔴 Not Implemented | 0% | Module does not exist. |
| Patient Journey Tracking | 🔴 Not Implemented | 0% | Module does not exist; no cross-module event/trigger mechanism was found that a future module could hook into either — the linkage is a dead-end table today. |

---

## 11. Final Summary

**What has been fully implemented:** the data model (reservations, patient mapping, audit log, extended token status), a complete and reasonably well-designed reservation/heartbeat/expiry mechanism, a full widget UI state machine with graceful SSE→polling degradation, and permission-gated backend endpoints for every step of the intended flow. The database schema and the transactional integrity of the core mapping write are solid.

**What still needs to be completed, in order of blocking severity:**
1. **Fix two concrete bugs that currently prevent the feature from working at all when embedded as documented:** the widget's URL-injected token is never attached to its outgoing requests (finding 1a), and its two mapping-endpoint calls are sent to URLs that don't match what the backend actually registered (finding 1b).
2. Resolve the `TokenRecord` entity/column mismatch for `registered_at`/`registration_user`/`supervisor_reset_*` (finding 2) and verify it with a real database, not just a code read.
3. Decide on and implement (or formally drop) the outbound widget→HIS `postMessage` contract that the HIS-side patch file currently expects but the widget never sends (finding 4).
4. Fix or remove the SSE live-update path, which currently cannot authenticate from a plain `EventSource` (finding 3).
5. Build the actual downstream consumers (Doctor Queue, Pharmacy Queue, Patient Journey) if this linkage is meant to feed them — none exist yet, and nothing currently reads `token_patient_mapping` outside the module that writes it.
6. Verify the HIS-side half of the integration against a real HIS codebase — everything on that side is currently only documentation/patch files in this repo, unconfirmed against actual HIS source.

**Is the Registration ↔ Token linking feature production-ready?** No. As currently wired, the single call that performs the actual linking (`POST /token/map/patient`) is sent to a URL that doesn't match the registered backend route, and the widget likely can't authenticate its requests at all in the deployment scenario the integration docs describe. These are not edge cases — they sit on the feature's one and only critical path. Everything upstream of that break point (kiosk issuance, queue display, reservation) is solid; everything at and after it is currently non-functional or unverifiable.

**Is the current implementation sufficient to support Doctor Queue, Pharmacy Queue, Loyalty, or Patient Journey Tracking?** No. None of those modules exist in this codebase today, and — independent of that — nothing outside the registration module currently reads the `token_patient_mapping` table or the `REGISTERED` token status, so even a hypothetical future module would need new integration work to consume this linkage, not just a bug fix to the existing path. The data model is a reasonable foundation for that future work, but no downstream wiring exists yet.
