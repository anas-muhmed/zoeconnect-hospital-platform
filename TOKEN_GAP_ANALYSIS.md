# Token Module — Gap Analysis
**Architecture spec:** `TOKEN_MODULE_ARCHITECTURE.md` (v1.0, June 2026)  
**Codebase snapshot:** `D:\HDSP\backend\src\modules\token\`  
**Date:** 2026-07-01

---

## Executive Summary

The Phase 1 entity layer is largely complete — all 14 database tables from the spec are represented by TypeORM entities and the kiosk, config, analytics, and audit services are correctly implemented. The critical gaps are concentrated in three areas: **(1) the WebSocket gateway still runs the pre-architecture legacy path**, **(2) the LOCATION-mode token issuance and call flow remain disconnected from `token_records`**, and **(3) several specified subsystems (display pages, daily reset cron, HIS retry queue, frontend pages) are not yet built**.

---

## Gap Inventory

### 🔴 Critical — Functional Correctness

---

#### GAP-1: Dual token issuance paths — LOCATION mode bypasses `token_records`

**Spec (§15.3, §22.4):** `token_records` is the central fact table. All issued tokens must persist there. Sequence is driven by PostgreSQL atomic upsert (`token_sequences`).

**Current code:** `TokenQueueController.issueFromKiosk` bifurcates on `assignmentType`:
- `SERVICE_CENTER` → `TokenQueueService.issueFromKiosk()` → PostgreSQL sequence → `token_records` persisted ✅
- `LOCATION` → `TokenService.issueToken()` → Redis `INCR` → `token_records` written **fire-and-forget** (non-blocking `.catch(() => {})`)

**Impact:** In LOCATION mode, if the async `TokenRecord` write fails silently, the token exists in the queue but has no persistent record. Analytics, audit, and reissue operations will have missing data. The `TokenSequenceService` (used only for SC mode) and the Redis counter are running parallel sequences that can diverge.

**Fix:** Route all issuance through `TokenQueueService.issueToken()` / `TokenSequenceService`. Remove the Redis `INCR` primary path for token issuance. The Redis `issuedCount` key can remain as a read cache for fast kiosk display but must not be the authoritative counter.

---

#### GAP-2: WebSocket gateway uses old call path — `token_records` not updated on call

**Spec (§7.2, §23.2, §27.2):** Operator presses `token:call` via WebSocket → `token_records.status` transitions to `CALLED`, `called_at`, `called_by` set, `token_calls` audit row inserted.

**Current code (`token.gateway.ts`):**
- `token:call` event → `TokenService.callToken()` → updates Redis `calledSet` + writes to old `token_calls` entity (only has `counterId, tokenNumber, calledBy`)
- `TokenQueueService.callToken()` exists and correctly updates `token_records` — but **is never called from the gateway**

**Impact:** The operator dashboard drives the queue via WebSocket. All calls made through the dashboard will NOT update `token_records`. Status transitions (WAITING → CALLED → SERVING → COMPLETED) only work through the REST endpoints in `TokenQueueController`, which no UI currently calls.

**Fix:** Rewire `TokenGateway.handleCall` to call `TokenQueueService.callToken()` instead of `TokenService.callToken()`. The gateway needs to look up the WAITING `TokenRecord` by `referenceId`/`tokenNumber` to get `recordId`, then call the queue service.

---

#### GAP-3: `token_calls` entity schema does not match spec

**Spec (§3.9):** `token_calls` has `action` ENUM (`CALLED|RECALLED|TRANSFERRED|HELD|SKIPPED|COMPLETED|CANCELLED|MISSED|REISSUED`), `from_counter_id`, `to_counter_id`, `performed_by`, `performed_at`, `notes`.

**Current code (`token-call.entity.ts`):** Only `counterId`, `tokenNumber`, `calledBy`, `calledAt` — no `action`, no transfer tracking, no notes.

**Impact:** The `token_calls` table in the spec is the complete audit trail for every operator action. The current table only records calls. Transfer, hold, skip, recall, and complete actions are not audited here (some are in `token_records` directly, none in `token_calls`).

**Fix:** Migrate `token_calls` schema to match spec, or leave the old table as-is and create the new `token_calls` in the schema while renaming the entity. Insert to the new table from `TokenQueueService` for every action.

---

#### GAP-4: Token prefix not resolved for LOCATION mode

**Spec (§15.2, §3.5):** `token_locations.token_prefix` configures the prefix per location. Tokens should display as `G-042` etc.

**Current code (`token-sequence.service.ts` `resolvePrefix`):**
```typescript
if (referenceType === 'SERVICE_CENTER') {
  // reads token_sc_configs.token_prefix ✅
}
return ''; // LOCATION always returns empty prefix ❌
```

**Impact:** All location-based tokens print without prefix (e.g., `042` instead of `G-042`). The `token_locations.token_prefix` column exists in the entity but is never read by the sequence service.

**Fix:** Add an `else` branch that looks up `token_locations.token_prefix` by `referenceId` when `referenceType === 'LOCATION'`.

---

### 🟠 High — Missing Specified Subsystems

---

#### GAP-5: Daily reset cron is missing

**Spec (§15.4):** A `@Cron(EVERY_MINUTE)` job checks each branch's `dailyResetTime` + timezone and:
1. Flushes Redis sequence keys for the branch
2. Sets all WAITING/CALLED `token_records` → `MISSED`
3. Clears `token_counters.current_token`
4. Broadcasts WebSocket reset event to all branch clients

**Current code:** `TokenSequenceService.resetBranchSequences()` exists but only updates `token_sequences.reset_at` timestamp. No cron job calls it. No status transitions happen. No WebSocket broadcast.

**Fix:** Add a `DailyResetService` with `@Cron('* * * * *')` that iterates `token_branch_config`, checks timezone-aware reset time, and performs all four reset actions.

---

#### GAP-6: Display page module not wired

**Spec (§3.10, §9, §12.7):** `token_display_pages` table with CRUD APIs (`/token/displays`), public endpoint `/display/:slug`, assignments JSONB field, WebSocket room `display:{slug}`.

**Current code:** `DisplayPage` entity is imported in `token.module.ts` but:
- No `DisplayController` or `DisplayService` provider registered
- No display-related routes in any controller
- No `display:{slug}` WebSocket room joined by any client
- The existing `DisplayPage` entity maps to an old `display_pages` table — schema likely does not match the spec's `token_display_pages` with `assignments JSONB` field

**Fix:** Implement `DisplayService` + `DisplayController` with the 5 endpoints from §12.7. Add display room joining in the gateway on `display:join` event. Verify the entity table name and schema match the spec.

---

#### GAP-7: HIS retry queue (Bull) not implemented

**Spec (§17.3, §21.5, §31.13):** HIS Oracle inserts go through a Bull queue (`his-bridge`) with exponential-backoff retry up to 48 hours.

**Current code:** `HisTokenBridgeService.insertPrintRecord()` is called fire-and-forget from `TokenService.issueToken()`. No Bull queue. `token.module.ts` has no `BullModule` import.

**Impact:** During HIS downtime, `PRINT_DATA_DETAIL` inserts are silently dropped. There is no retry mechanism.

**Fix:** Register `BullModule.registerQueue({ name: 'his-bridge' })` in `token.module.ts`. Create `HisBridgeProcessor` with `@Process('insertPrintRecord')`. Enqueue jobs from `TokenService.issueToken()` instead of calling the bridge directly.

---

#### GAP-8: Frontend token pages do not exist

**Spec (§28, §26):** Requires:
- `/kiosk/[slug]/page.tsx` — public kiosk (MULTIPLE/SINGLE variants)
- `/display/[slug]/page.tsx` — public display board
- `/(platform)/token/page.tsx` — operator counter dashboard (mode-adaptive)
- `/(platform)/token/config/` — 7 admin config sub-pages
- `/(platform)/token/analytics/page.tsx`

**Current code:** Only `frontend/src/lib/audio/tokenAudio.ts` found under the token domain. No frontend pages exist.

**Fix:** This is the entire frontend build. Prioritize in order: counter dashboard → kiosk page → display board → config pages → analytics.

---

### 🟡 Medium — Incomplete API Coverage

---

#### GAP-9: Public kiosk URL path does not match spec

**Spec (§12.3):** `POST /kiosk/:slug/issue` — public, no prefix.

**Current code:** `POST /token/queue/kiosk/:slug/issue` — controller prefix is `token/queue`.

**Impact:** Frontend kiosk page calling `/kiosk/:slug/issue` (as per spec) will 404. The `GET /kiosk/:slug` config endpoint is correctly at `/kiosk/:slug` (in `TokenKioskController` with `@Controller()` and no prefix).

**Fix:** Move the issue endpoint to a dedicated `@Controller('kiosk')` or change the route path to match spec.

---

#### GAP-10: `GET /kiosk/:slug/state` endpoint missing

**Spec (§12.3):** `GET /kiosk/:slug/state` — public endpoint for real-time queue state for a specific kiosk.

**Current code:** `GET /token/queue/state/:referenceType/:referenceId` exists but requires caller to know the internal `referenceId`. No slug-based state endpoint.

**Fix:** Add `GET /kiosk/:slug/state` public endpoint that resolves the kiosk's active assignments and returns queue state per assignment.

---

#### GAP-11: `RECALLED` status has no implementation

**Spec (§24.1, §7.3):** State machine allows `MISSED → RECALLED → CALLED`. Recall re-broadcasts the call announcement without issuing a new token.

**Current code:** `TokenStatus` type includes `'RECALLED'`. No `recallToken()` method in `TokenQueueService`. No REST endpoint. No WebSocket event.

**Fix:** Add `TokenQueueService.recallToken(recordId)`, REST endpoint `POST /token/queue/recall/:id`, and WS event `token:recall`.

---

#### GAP-12: `SERVING` status has no entry point

**Spec (§7.2, §24.1):** `CALLED → SERVING` transition occurs when operator clicks to start serving.

**Current code:** `TokenQueueService.serveToken()` is implemented. However, no REST endpoint calls it, and the gateway has no `token:serve` event. The state machine effectively goes `CALLED → COMPLETED`, skipping `SERVING`.

**Fix:** Expose `POST /token/queue/serve/:id` and/or add `token:serve` WS event. The counter dashboard needs a "Start Serving" action.

---

#### GAP-13: Analytics API endpoints not confirmed

**Spec (§12.9):** 5 endpoints:
- `GET /token/analytics/summary?date=`
- `GET /token/analytics/volume?from=&to=`
- `GET /token/analytics/wait-times?date=`
- `GET /token/analytics/counter-perf?date=`
- `GET /token/analytics/export?from=&to=&format=csv`

**Current code:** `TokenAnalyticsController` exists and `TokenAnalyticsService.getAnalytics()` provides a generic query. The controller content was not fully audited but the service only exposes `getAnalytics(opts)` and `backfill(date)` — it does not break out wait-times, counter-perf, or CSV export as separate methods.

**Action:** Read `token-analytics.controller.ts` and verify all 5 routes exist with appropriate response shaping.

---

### 🟢 Low — Behavioral / Security Gaps

---

#### GAP-14: Gateway broadcasts to ALL branches on every state change

**Spec (§16.2, §29.2):** Each WebSocket room is `branch:{branchId}` scoped. Cross-branch events must be impossible.

**Current code (`token.gateway.ts` `broadcastState`):**
```typescript
const branches = new Set(this.socketBranch.values());
// iterates ALL connected branches, not just the affected one
await Promise.all([...branches].map(async (bid) => {
  const state = await this.tokenService.getAllLocationsState(bid);
  this.server.to(`branch:${bid}`).emit('token:state', state);
}));
```

**Impact:** Every token call triggers N database queries (one per active branch) and broadcasts to all branches. At scale (10 branches × 50 counters), a single call event generates 10 full-state queries. This also technically leaks timing information across branches.

**Fix:** `broadcastState(branchId)` should query and emit only for the specified `branchId`, not iterate all connected branches.

---

#### GAP-15: `broadcastTokenIssued` ignores branchId (emits globally)

**Spec (§16.2):** All events are branch-scoped.

**Current code:**
```typescript
broadcastTokenIssued(locationId: string, issuedCount: number, branchId?: string | null): void {
  this.server.emit('token:issued', { locationId, issuedCount }); // global emit ❌
}
```

**Impact:** Every token issue event goes to every connected client across all branches.

**Fix:** Use `this.server.to(`branch:${branchId}`).emit(...)`.

---

#### GAP-16: Kiosk public config response excludes branding

**Spec (§31.4, §8.1):** `GET /kiosk/:slug` response includes a `branding` object (logo, colors, welcome message, font size).

**Current code (`TokenKioskService.getPublicKioskConfig`):** Returns `{ kioskSlug, kioskType, branchId, assignments }` — no branding.

**Fix:** Join `token_kiosk_branding` in `getPublicKioskConfig` and include in response.

---

#### GAP-17: WebSocket gateway — no counter, display, or kiosk rooms

**Spec (§16.2):**
```
Room: counter:{counterId}     — specific counter operator
Room: display:{displayPageSlug}
Room: kiosk:{kioskSlug}
```

**Current code:** Only `branch:{branchId}` and `location:{locationId}` rooms exist. `token:join` joins `location:{locationId}` — there is no `counter:{counterId}` room.

**Impact:** Per-counter event delivery (e.g., notifying only the operator whose counter just got a transfer) is not possible. Display board-specific events require client-side filtering of the branch-level event stream, which the spec says display boards should do — but they cannot connect to a `display:{slug}` room since it doesn't exist.

**Fix:** On `token:join`, also join `counter:{counterId}`. On display/kiosk WS connect, join the appropriate room. Update `broadcastTokenCalled` to also emit on `counter:{counterId}`.

---

#### GAP-18: No validation preventing mode switch with active counters

**Spec (§20.2):** "Show warning; require admin confirmation; counters stay active until operator leaves."

**Current code (`TokenConfigService.updateMode`):** Directly saves the new mode with no check for active counter sessions in Redis.

**Fix:** Before saving, check `redis.keys('token:session:*')` for the branch and return a warning payload if operators are active, requiring a `?force=true` confirm param.

---

#### GAP-19: `RECEPTIONIST` role missing from permission guards

**Spec (§13):** `RECEPTIONIST` has `TOKEN:COUNTER:READ`, `TOKEN:ISSUE:MANUAL`.

**Current code:** The gateway's `hasPermission` method only short-circuits for `SUPER_ADMIN` and `HOSPITAL_ADMIN`. Whether `RECEPTIONIST` role is defined in the RBAC module and has the correct permissions mapped to the `TOKEN:ISSUE:MANUAL` permission string is not verified in the token module.

**Action:** Confirm `RECEPTIONIST` role exists in RBAC with `TOKEN:COUNTER:READ` and `TOKEN:ISSUE:MANUAL` permission codes. Add `TOKEN:ISSUE:MANUAL` permission check to the manual issue endpoint.

---

#### GAP-20: Token sequence `startNumber` and `maxNumber` not enforced

**Spec (§3.4, §3.5, §20.1):** Configurable `start_number` (default 1) and `max_number` (default 999) with rollover warning.

**Current code (`TokenSequenceService.getNextToken`):** Uses `INSERT ... ON CONFLICT DO UPDATE SET current_number + 1` with no bounds check. Sequences will grow beyond 999 indefinitely. No rollover notification.

**Fix:** After resolving prefix, also read `startNumber`/`maxNumber` from the config. If `current_number` hits `maxNumber`, notify admin (e.g., emit to `branch:{branchId}` room) and optionally reset or cap.

---

## Implemented and Matching ✅

The following areas match the spec and require no changes:

| Area | Spec Section | Status |
|---|---|---|
| All 14 DB entities defined | §3 | ✅ Match |
| `token_branch_config` CRUD | §11.1 | ✅ Match |
| `token_kiosk` CRUD + slug generation (base-32, 8-char) | §14.1, §6.2 | ✅ Match |
| `token_kiosk_assignments` add/remove (merge in/out) | §6.2, §8.3 | ✅ Match |
| MULTIPLE kiosk blocks second assignment | §20.2 | ✅ Match |
| Archive vs. disable vs. delete kiosk | §31.10 | ✅ Match |
| QR code endpoint (SVG, error level M) | §14.3 | ✅ Match |
| `token_sc_config` upsert / deactivate | §11.2 | ✅ Match |
| `token_kiosk_branding` CRUD | §11.7 | ✅ Match |
| `token_audit_log` — immutable, all config writes audited | §19 | ✅ Match |
| PostgreSQL atomic sequence upsert | §15.3 | ✅ Match (SC mode) |
| Priority map (EMERGENCY=10 … WALK_IN=100) | §15.5 | ✅ Match |
| `TokenQueueService` — complete/hold/skip/miss/cancel/transfer/reissue | §7.2, §7.3 | ✅ Match |
| Reissue creates new record, links via `reissued_from_id` | §7.3 | ✅ Match |
| Hold deprioritizes by +50 | §15.5 | ✅ Match |
| Redis call-lock (SETNX) prevents double-call | §20.3 | ✅ Match |
| Branch isolation — `branchId` on every entity and service query | §29.1 | ✅ Match |
| `TokenAnalyticsService` nightly cron at 00:15 | §13 | ✅ Match |
| Analytics upsert is idempotent (ON CONFLICT DO UPDATE) | §13 | ✅ Match |
| Token display config JSONB (print_global, display_global) | §3.11 | ✅ Match |
| HIS department / SC lookup passthrough | §12.8 | ✅ Match |
| `ensureLocationForServiceCenter` auto-create/update | §6.2 | ✅ Match |
| License guard on all token endpoints | §10 | ✅ Match |
| JWT `activeBranchId` claim enforced at service layer | §29.1 | ✅ Match |

---

## Recommended Remediation Order

| Priority | Gap | Effort |
|---|---|---|
| P0 | GAP-2 — Rewire WS gateway `token:call` to `TokenQueueService` | Medium |
| P0 | GAP-1 — Unify LOCATION issuance through `TokenQueueService` | Medium |
| P1 | GAP-4 — Resolve LOCATION prefix from `token_locations` | Small |
| P1 | GAP-14 / GAP-15 — Fix cross-branch broadcast leaks | Small |
| P1 | GAP-3 — Migrate `token_calls` entity to full spec schema | Medium |
| P1 | GAP-5 — Implement daily reset cron | Medium |
| P2 | GAP-6 — Build display page CRUD + WebSocket room | Large |
| P2 | GAP-7 — Add Bull queue for HIS retry | Medium |
| P2 | GAP-9 / GAP-10 — Fix kiosk API paths, add `/state` endpoint | Small |
| P2 | GAP-17 — Add counter/display/kiosk WS rooms | Medium |
| P2 | GAP-16 — Include branding in public kiosk config | Small |
| P3 | GAP-11 — Implement `RECALLED` status and `recallToken()` | Small |
| P3 | GAP-12 — Expose `SERVING` transition endpoint | Small |
| P3 | GAP-18 — Mode switch active-counter guard | Small |
| P3 | GAP-20 — `maxNumber` enforcement + rollover notification | Small |
| P4 | GAP-8 — Build entire frontend | Large |
| P4 | GAP-13 — Verify analytics endpoints against spec | Small |
| P4 | GAP-19 — Verify RECEPTIONIST RBAC mapping | Small |
