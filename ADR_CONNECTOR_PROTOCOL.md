# ADR: HDSP Connector Protocol — Registration, Authentication, Transport, and Dispatch

**Status:** Accepted (Phases A, B & C implemented, 2026-07-21)
**Related docs:** `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` (full original architecture proposal), `HDSP_CONNECTOR_CURRENT_STATE_AUDIT.md` (file-by-file state, updated after each phase)

This is a lightweight ADR, not a full design doc — it records *what was
decided and why*, as a stable reference for reviewing and extending the
protocol in later phases. For,,,,,,,, exhaustive rationale/trade-off discussion,
see the architecture doc above; this ADR summarizes the decisions that
doc's proposal converged on plus everything that changed during actual
implementation.

## 1. Context

HDSP Cloud needs to reach a hospital's on-prem Oracle HIS database without
either (a) the hospital opening an inbound firewall rule, or (b) Oracle
credentials ever leaving the hospital network. The Connector is a
standalone process installed inside the hospital network that dials out
to HDSP Cloud and relays pre-registered queries to the local Oracle
instance. Self-hosted deployments are unaffected by any of this — the
Connector is purely a cloud-mode capability; self-hosted keeps direct
Oracle connectivity via `DirectOracleTransport`/`OraclePoolManager`
exactly as it always has.

## 2. Decision: Registration flow

**A Connector identity is established by redeeming a one-time pairing
key, not by a human-managed API key or certificate.**

- `TenantProvisioningService` already generates a `TenantConnectorPairing`
  row (bcrypt-hashed one-time key, status `pending`) at tenant
  provisioning time — this predates the Connector's own implementation
  and was the "biggest missing piece" identified in the initial audit.
- `POST /api/v1/connector/register` `{ tenantCode, pairingKey, hostname }`
  → looks up the tenant by code, scans that tenant's `pending` pairing
  rows, `bcrypt.compare()`s the supplied key against each. On match: flips
  the pairing to `active` (single-use — an already-active pairing can
  never match again, proven by a dedicated test case), creates a new
  `ConnectorInstance` row (`status: 'registered'`) linked to the pairing,
  and returns a fresh access+refresh token pair.
- Unknown tenant code and wrong pairing key return the **identical**
  `UnauthorizedException` — deliberately no information leak about which
  part of the pair was wrong.
- `POST /api/v1/connector/token/refresh` `{ refreshToken }` rotates a
  still-valid refresh token for a fresh pair, blacklisting the old one
  (§3 below).

**Why a pairing key redemption instead of e.g. a long-lived static API
key issued once:** the pairing key is generated server-side per tenant at
provisioning time, transmitted out-of-band (installer/onboarding flow,
not committed to yet — packaging is explicitly future work), and is
consumed exactly once. Compromise of the pairing key before first use is
the only exposure window; after registration, the credential in play is
the token pair (§3), which rotates and can be revoked independently of
the pairing key.

## 3. Decision: Authentication model

**Connector tokens are structurally incapable of authenticating as a
user, and vice versa.**

- Dedicated JWT secrets: `jwt.connectorSecret` / `jwt.connectorRefreshSecret`,
  wired via `env.validation.ts` (`JWT_CONNECTOR_SECRET`,
  `JWT_CONNECTOR_REFRESH_SECRET`, plus matching `_EXPIRES_IN` vars) —
  entirely separate from the user-facing `jwt.secret`/`jwt.refreshSecret`.
  A token signed with one secret fails verification against the other by
  construction, not by a runtime `if` check that could be forgotten at a
  new call site.
- Every connector token carries `type: 'connector_access'` or
  `'connector_refresh'`; both `ConnectorRegistrationService.refresh()` and
  `ConnectorGateway.handleConnection()` check `type` explicitly even
  though the secret alone already scopes the token — defense in depth
  against a future bug that verifies against the wrong secret.
- Refresh rotation follows the same jti-blacklist pattern as the existing
  user `AuthService`: on `refresh()`, the old token's `jti` is written to
  Redis with a TTL equal to its remaining lifetime, so a replayed
  (already-rotated) refresh token is rejected even though it would
  otherwise still pass signature verification.
- Local credential storage (connector-side): `TokenStore` encrypts the
  token pair at rest with AES-256-GCM (Node's built-in `crypto`), key in
  a separate 0600 file. **Explicitly documented limitation, not hidden:**
  this is not an OS keychain (`keytar`/Windows Credential Manager) — that
  remains the intended long-term target (see
  `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §11) but was judged too risky to
  add as a new native-compiled dependency the same night as this phase,
  with no Windows machine available to verify it links there. Protects
  against accidental exposure (logs, config backups, casual directory
  reads); does not protect against an attacker with full filesystem read
  access on the host.

## 4. Decision: Transport selection — WebSocket as the production
   transport, Redis retained for internal/dev use only

Two implementations exist for the same `IMessageTransport` contract
(`onRequest`/`send`/`start`/`stop`, `connector/src/protocol/message-transport.interface.ts`):

| | `RedisMessageTransport` | `WebSocketMessageTransport` + `ConnectorGateway` |
|---|---|---|
| Direction | Symmetric — same class either side, pub/sub | Asymmetric — Connector always dials out (client), Cloud always accepts (`ConnectorGateway`, a NestJS Gateway with `Server`/room access a plain `IMessageTransport` can't express) |
| Network requirement | Connector and Cloud must share reachability to one Redis instance | Connector makes exactly one outbound WebSocket connection; no inbound port on the hospital side ever |
| Identity/auth | None built in (an authenticated Redis channel is not a per-connector identity) | WS handshake is authenticated with a connector-scoped JWT (§3); the gateway ties the socket to a specific `ConnectorInstance` and joins tenant/connector-scoped rooms |
| Firewall posture | Requires either a shared network (same VPC/LAN) or opening Redis to the hospital — not viable for a real hospital deployment | Looks like ordinary outbound HTTPS traffic on one persistent connection (`transports: ['websocket']` only, no HTTP long-polling fallback, so it can't silently degrade into repeated polling requests) |

**Decision: WebSocket is the transport for every real (non-same-host)
deployment.** Redis remains supported (`CONNECTOR_TRANSPORT=redis`,
still the connector-side default for now, purely to avoid a breaking
default-flip mid-project) because it was the original Phase 6/7 proof of
the transport-abstraction mechanism, is convenient for same-host/CI
testing, and required zero new work to keep. It is **not** appropriate
for a real hospital-to-cloud link and is not the direction this project
is going — new capability work (tenant-scoped dispatch, fleet visibility,
health status) is being built against the WebSocket path only.
`IMessageTransport`'s own doc comment already anticipated exactly this —
"transport-agnostic contract... to support multiple transport
implementations" — so this is the interface being used as designed, not
retrofitted.

The connector-side transport choice is one env var
(`CONNECTOR_TRANSPORT=redis|websocket`, default `redis`) precisely so a
production rollout is a config change, not a code change, and so the
existing Redis-based path keeps working unmodified for anything not yet
migrated.

**Not yet done, and explicitly the next milestone:** the cloud/backend
side (`CloudOracleTransport`) still only implements the `RedisMessageTransport`
half of this table — it has no path today that dispatches through
`ConnectorGateway`/`ConnectorJobDispatchService` at all. Closing that gap
(resolving the ambient tenant's registered `ConnectorInstance` and
dispatching through the durable BullMQ-backed WS path instead of
`RedisMessageTransport`) is the subject of the next phase, tracked
separately from this ADR.

## 5. Decision: Dispatch lifecycle — in-memory correlation, BullMQ for
   durability

Two layers, deliberately kept separate:

1. **`ConnectorGateway.dispatchToConnector(connectorId, request, timeoutMs)`**
   — the mechanism. Purely in-process: a `Map<correlationId, {resolve,
   reject, timer}>` keyed by the request's `correlationId`, one socket
   per connected `connectorId` tracked in a second map. Emits
   `connector:request` into the `connector:{id}` room; the matching
   `connector:response` (correlated by the same `correlationId`) resolves
   the pending entry. A `setTimeout` per request rejects on no response
   within `timeoutMs`. On `handleDisconnect()`, every request still
   pending *for that specific connector* is failed immediately with
   `ConnectorOfflineError`, rather than waiting out each one's individual
   timeout — a disconnected socket means every one of its outstanding
   requests is already known to be unanswerable.
2. **`ConnectorJobDispatchService` + `ConnectorJobDispatchProcessor`**
   — the durability wrapper. A caller-facing `dispatch()` enqueues a Bull
   job (`QUEUE_NAMES.CONNECTOR_JOBS`) and awaits `Job.finished()`; the
   processor is a two-line passthrough that calls
   `dispatchToConnector()` and lets its resolution/rejection become the
   job's own. Bull's existing retry policy (`bullAsyncOptions`: 3
   attempts, exponential backoff from 1s) turns "connector briefly
   offline" or "backend restarted mid-dispatch" into an automatic retry
   instead of caller-written retry logic, and survives a backend process
   restart between enqueue and completion (the in-memory `pending` map in
   `ConnectorGateway` does not).

**Why not put the Bull logic inside `ConnectorGateway` itself:** the
gateway needs no knowledge that Bull exists — its job is purely "route
this request to this connected socket and correlate the response," which
is directly testable (and tested — see §6) without a queue in the loop
at all. Durability is a concern belonging to the caller of dispatch, not
the dispatch mechanism itself.

## 6. Verification approach

`connector-websocket-e2e.spec.ts` proves the actual new mechanism — a
real Fastify+socket.io `ConnectorGateway`, a real `WebSocketMessageTransport`
client authenticated with a genuinely signed connector-access JWT,
round-tripping a `health-check-select-1` request through a mocked
`OracleClient` — without requiring live Redis, Bull, or Oracle in the
test environment. `ConnectorJobDispatchProcessor` is intentionally a
two-line passthrough to the exact method this test exercises, so once the
WS round trip is proven, the only remaining untested seam is "does Bull
deliver an enqueued job to its processor," which is Bull's own tested
behavior, not this codebase's.

`connector-registration.service.spec.ts` covers the registration/refresh
flow in isolation (happy path, wrong key, unknown tenant, pending-only
lookup, blacklisted-refresh reuse, deleted-instance refresh).

## 7. Decision: closing the loop — `CloudOracleTransport`'s WebSocket
   dispatch mode (Phase C)

The gap flagged in §4/§6 ("nothing on the cloud side dispatches through
`ConnectorGateway` yet") is now closed. `CloudOracleTransport` gained a
second dispatch mode, `CLOUD_ORACLE_TRANSPORT_MODE=websocket` (default
remains `redis` — zero behavior change for any deployment that hasn't
opted in), independent of `ORACLE_TRANSPORT` (which only selects whether
`CloudOracleTransport` is used at all).

In `'websocket'` mode, a call to `query()`/`execute()` now: resolves the
ambient tenant via `TenantContextStorage` (same mechanism
`OraclePoolManager` already uses for tenant-scoped Oracle pools), looks
up that tenant's registered `ConnectorInstance` via the new
`ConnectorDirectoryService` ("most recent non-revoked instance for this
tenant"), and dispatches through `ConnectorJobDispatchService` exactly as
described in §5. A tenant with no ambient context, or no registered
Connector, gets a new `ConnectorNotRegisteredError` — deliberately NOT
routed through the circuit breaker (§4's `HisUnavailableError` path),
since "this tenant has no Connector" is a configuration state, not a
transient failure retrying will fix.

This completes the full path the milestone asked for:

```
Business Service -> CloudOracleTransport -> ConnectorJobDispatchService ->
ConnectorGateway -> WebSocket -> HDSP Connector -> Oracle HIS -> Response
```

Validated for two conformance queries: `health-check-select-1` (static,
no binds) and a new `patient-search` template (parameterized, row-
returning) — see `cloud-oracle-transport-websocket-e2e.spec.ts`. **Both
are deliberately representative/generic conformance queries, not real
production HIS SQL.** In particular, `patient-search` is NOT
`PatientService.search()`'s actual query — that SQL is built dynamically
per tenant from `HisSchemaConfig`'s configured table/column names (a
different string per hospital), which is fundamentally incompatible with
`knownTemplates`'s exact-string-match allow-list as it exists today.
Wiring real, per-tenant HIS queries through `cloud_relay` mode requires
either a parameterized/templated allow-list or a per-tenant registered
template set — tracked as follow-up work, not done in this pass, and not
papered over: the milestone's goal was proving the mechanism end-to-end,
which it does.

## 8. Consequences / open items

- Real production HIS query coverage through `cloud_relay` mode requires
  resolving the exact-string-match-vs-per-tenant-dynamic-SQL tension
  described in §7 — the single biggest remaining gap between "the
  mechanism works" and "cloud tenants can actually use it for real
  queries."
- `ConnectorJobDispatchService`'s Bull-backed durability was not
  exercised by Phase C's own test (no live Redis in the sandbox this was
  built in) — `sendViaWebSocket()`'s call into it is a straight
  passthrough, reviewed by hand; a stand-in satisfying the same method
  shape was used in its place, calling `ConnectorGateway.dispatchToConnector()`
  directly. Recommended before treating this as deploy-ready: run the
  real path against live Redis/Bull locally.
- No periodic heartbeat — a connector's `online`/`offline` status is
  tied to socket connection lifetime only, so a connected-but-wedged
  process is indistinguishable from a healthy one today.
- Fleet visibility (a UI/API for "which connectors are online"), Windows
  Service packaging/installer, and auto-update are all deliberately
  deferred — they are operational capabilities layered on top of this
  protocol, not architectural prerequisites for it, and building them
  before the Oracle execution path is proven end-to-end would mean
  building fleet/ops tooling around a mechanism not yet known to work for
  its actual purpose.
- `TokenStore`'s AES-256-GCM-not-OS-keychain limitation (§3) is tracked as
  a packaging-phase follow-up, not silently accepted as permanent.
