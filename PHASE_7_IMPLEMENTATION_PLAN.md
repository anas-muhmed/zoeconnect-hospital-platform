# Phase 7 Implementation Plan — Cloud Oracle Transport

**Companion to:** `HDSP_Hybrid_Implementation_Roadmap.md`'s Phase 7 section — tracks actual execution, matching Phases 2-6's companion-doc pattern.

**Governance carried forward:** continuous implementation, no per-task stop-and-review, architectural blockers only.

**Preceded by:** `PHASE_7_VENDOR_PORTAL_IMPACT_ANALYSIS.md` (2026-07-16) — cross-repository impact analysis, user-confirmed conclusion: no Vendor Portal changes required for Phase 7. Two findings carried forward as explicit Phase 10 work items (Vendor Portal's `testDbConnection()` assumes direct Oracle connectivity; Connector-instance provisioning ownership is unassigned by the roadmap) — both referenced again below where they intersect with `CloudOracleTransport`'s own design.

**Design directive (2026-07-16, user-specified):** mirror the Interface → Second Provider → Configuration Switch pattern from Phases 3-5 exactly; the one added invariant for this phase is that Business modules (HIS, Attendance, EIC, Token, Loyalty) must never know whether Oracle is local or remote — they continue calling `IOracleTransport` exactly as today, only the bound implementation changes.

---

## Pre-flight

`IOracleTransport` (Phase 2) already has the right shape (`isAvailable`/`query`/`queryOne`/`execute`/`reconfigure`) and already anticipated this phase in its own doc comment ("Phase 7's `CloudOracleTransport`... can implement it with the same method signatures"). `DirectOracleTransport` (Phase 2) and `OracleClient` (Phase 6) needed no changes. The one real design question Phase 7 had to resolve, not fully specified by the roadmap text:

**`IOracleTransport.query()`/`execute()` take an arbitrary raw SQL string; the Phase 6 Message Transport only accepts a pre-registered `sqlTemplateId`.** This is not a contradiction to paper over — it's Phase 6's own deliberate SQL-allow-list security boundary meeting Phase 7's "same signature" requirement. Resolved by giving `CloudOracleTransport` a local `knownTemplates` map (exact-SQL-string → `sqlTemplateId`), checked on every call before a request is sent. A `sql` argument that isn't a known, allow-listed template throws `UnregisteredCloudQueryError` — a new, honest, non-retryable failure mode distinct from `HisUnavailableError`. This means **`CloudOracleTransport` today only supports the specific queries registered in `knownTemplates`** (currently one: a minimal `SELECT 1 FROM dual` conformance/pilot query, paired identically in the Connector's own `SqlTemplateRegistry`, `connector/src/index.ts`). Expanding this to real production HIS queries is explicitly deferred — Phase 6's own completion notes already flagged this as "Phase 7 work, once CloudOracleTransport defines which queries it actually needs," and this is that definition's starting point, not its finish.

This directly matches the user's own stated success criterion — "The Connector successfully executes allow-listed SQL templates over the Phase 6 protocol" — rather than promising unrestricted raw-SQL parity, which would have required weakening Phase 6's security boundary.

---

## Task sequencing

1. **Task 7.1 — `CloudOracleTransport`** (`backend/src/modules/his/cloud-oracle.transport.ts`): implements `IOracleTransport` via `@hdsp/connector`'s `RedisMessageTransport` (backend now depends on `@hdsp/connector` as a `file:` dependency, mirroring `@hdsp/oracle-client`'s Phase 6 wiring — importing only the Message Transport client capability, not running the Connector process itself). Error-semantics parity: a Message Transport response with `error.retryable: true` is translated to a thrown `HisUnavailableError` — the exact same exception type `OracleClient` throws — so every existing `catch (err) { if (err instanceof HisUnavailableError) ... }` call site in Business modules keeps working unchanged regardless of which transport is active.
2. **Task 7.2 — `ORACLE_TRANSPORT` mode-selection**: `his-config.module.ts`'s `ORACLE_TRANSPORT` binding is now a factory (both transports always registered, selected by `ORACLE_TRANSPORT` env var — `direct`/`cloud_relay`, default `direct`), identical pattern to `StorageModule`/`LicensingModule`/`NotificationModule`. New env vars: `ORACLE_TRANSPORT`, `CONNECTOR_REDIS_URL` (optional, defaults to the existing `REDIS_HOST`/`REDIS_PORT`), `CONNECTOR_REQUEST_TIMEOUT_MS`.
3. **Task 7.3 — Conformance suite**: mocked-dependency suite (`ioredis` mocked at the module level, `RedisMessageTransport.prototype.send` stubbed — no live Oracle/Redis needed) proving: both transports return the same shaped result for the one shared conformance query; `CloudOracleTransport` correctly refuses a non-registered query (the deliberate, documented divergence — asserted explicitly, not hidden); retryable failures map to `HisUnavailableError` on both transports; non-retryable failures do not.
4. **Task 7.4 — Circuit-breaker/retry parity**: `CloudOracleTransport` implements the same cooldown-based circuit breaker as `OracleClient` (15s cooldown, tripped only by transport-level failures — timeout, Redis unreachable — never by an `UnregisteredCloudQueryError`, mirroring `OracleClient`'s own "connection-acquire failure trips the breaker, a bad query doesn't" distinction). **Documented, not silently dropped, divergence**: `OracleClient`'s "retry" is pool-*creation* retry (3 attempts with backoff, once at startup) — there's no equivalent persistent-connection concept for a stateless per-request Message Transport call, so `CloudOracleTransport` doesn't retry individual `send()` calls; it fails fast to the circuit breaker instead. This was a deliberate choice, not an oversight: retrying a `send()` that might have already reached the Connector risks duplicate SQL execution for a non-idempotent `execute()` template, which `OracleClient`'s pool-creation retry never risked (it retries *connecting*, never a query already in flight).
5. **CI**: `cloud-oracle.transport.ts` added to Task 2.9's infrastructure-import-boundary guardrail's `PROVIDER_FILES` (no binding-module change needed — `his-config.module.ts` was already listed).

---

## Status: ✅ PHASE 7 COMPLETE for sandbox-reachable scope (2026-07-16)

| Success criterion (user-specified) | Status | Notes |
|---|---|---|
| `DirectOracleTransport` still passes existing functionality unchanged | ✅ | Zero changes to `DirectOracleTransport`/`OracleClient`/`OraclePoolService` in this phase |
| `CloudOracleTransport` implements the same contract | ✅ | Same 5-method `IOracleTransport` surface |
| Switching `ORACLE_TRANSPORT=direct\|cloud_relay` requires no business-module changes | ✅ | Confirmed by construction — no Business-module file touched in this phase |
| Connector successfully executes allow-listed SQL templates over the Phase 6 protocol | ✅ | One conformance template proven end-to-end (mocked transport); real production template set is a follow-up, not this phase's job |
| Error semantics remain equivalent | ✅ | `HisUnavailableError` mapping verified in the conformance suite; one honest, documented divergence (no per-query retry — see Task 7.4) |
| No API changes | ✅ | Confirmed — no controller/DTO touched |
| No Vendor Portal changes | ✅ | Per the preceding cross-repository impact analysis |
| No database schema changes | ✅ | No migration added in this phase |

**Task 7.5 (Controlled pilot) — explicitly NOT attempted, same standing posture as every other environment-dependent item in this project (B9-B12, Phase 6's real-Oracle parity check, etc.):** a real pilot requires a deployed Connector instance, a real (test) Oracle database, and a real Redis reachable from both — none of which exist in this sandbox. What Task 7.5 needs once that environment exists:
1. Deploy one Connector instance (`npm run build:connector && npm run dev:connector` per Phase 6's wiring) pointed at a test Oracle instance.
2. Set `ORACLE_TRANSPORT=cloud_relay` on one staging backend instance, pointed at the same Redis the Connector uses.
3. Exercise the one registered conformance template (`health-check-select-1`) end-to-end, confirming a real (not mocked) round-trip.
4. Only then begin expanding `knownTemplates`/the Connector's `SqlTemplateRegistry` with real HIS queries, one at a time, each conformance-tested against `DirectOracleTransport`'s real output for the same query before being trusted.

**Follow-ups for a human, outside this session's reach:**
1. Task 7.5's real pilot (above) — the single highest-priority follow-up, same class of limitation as Phase 6's real-Oracle parity check.
2. Expand `CloudOracleTransport.knownTemplates` / the Connector's `SqlTemplateRegistry` to cover real production HIS queries, once Task 7.5's pilot proves the mechanism against real infrastructure.
3. Run `npm install` to resolve the new `@hdsp/connector` workspace dependency in `backend/package.json`; run the real build/test/lint toolchain.
4. The two Phase 10 work items carried forward from the Vendor Portal impact analysis remain open and are not re-litigated here: `testDbConnection()`/`oracle-test`'s direct-connectivity assumption, and Connector-instance provisioning ownership.
5. `queryOne()`'s minor behavioral difference: `DirectOracleTransport` asks Oracle for `maxRows: 1` server-side; `CloudOracleTransport` fetches all rows for a template and takes the first client-side (the Message Transport protocol has no per-request row-limit field yet). Functionally equivalent for the current conformance template; worth a protocol extension (`maxRows` on `MessageTransportRequest`) if a real production template returns a large result set.
