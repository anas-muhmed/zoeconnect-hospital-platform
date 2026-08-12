# HDSP Cloud Connector — Architecture

Date: 2026-07-21
Status: Proposed. Not started. No code changes in this document.

## 0. Read this first — this is not a greenfield project

Before proposing anything new, I audited the codebase for prior work in this
exact direction, because the request describes something that sounded like
it might already partially exist. It does. This changes the shape of the
whole document: most of what follows is "extend and finish X," not "build Y
from scratch."

What already exists and works today, unit-tested, wired end-to-end for one
conformance query:

- **`connector/`** — a standalone Node/TypeScript package (`@hdsp/connector`),
  independently versioned, with its own CI, tests, and a `VERSIONING.md`/
  `COMPATIBILITY.json` scheme. `Connector` (`connector/src/connector.ts`)
  connects an `OracleClient` (the same shared package `OraclePoolManager`
  uses — see tonight's Phase 3 work), registers a request handler on an
  `IMessageTransport`, and resolves every incoming request's
  `sqlTemplateId` against a `SqlTemplateRegistry` allow-list before ever
  touching Oracle. It never accepts raw SQL over the wire — this is
  already exactly the "Query Registry, not raw SQL" design principle the
  request asks for.
- **`IMessageTransport`** (`connector/src/protocol/message-transport.interface.ts`)
  — a transport-agnostic interface (`send`/`onRequest`/`start`/`stop`) with
  correlation-ID-based request/response messages. Its own doc comment,
  written when it was built, already says: *"a message queue for async
  sync traffic + WebSocket/short-poll for interactive lookups... A
  WebSocket transport for the interactive-lookup case is left as a
  documented, not-yet-implemented follow-up."* That follow-up is most of
  what this document designs.
- **`RedisMessageTransport`** — the one concrete `IMessageTransport`
  implementation that exists, using `ioredis` pub/sub (request channel
  `hdsp:connector:requests`, per-request response channel
  `hdsp:connector:responses:<correlationId>`).
- **`CloudOracleTransport`** (`backend/src/modules/his/cloud-oracle.transport.ts`)
  — the backend-side counterpart, implementing the same `IOracleTransport`
  interface `DirectOracleTransport` (wrapping `OraclePoolManager`) does.
  Already selectable via `ORACLE_TRANSPORT=cloud_relay` env var
  (`his-config.module.ts`'s factory, alongside `'direct'`) — so the seam
  for "this tenant's Oracle traffic goes through a connector instead of a
  local pool" already exists at the DI level.
- **A health endpoint** (`connector/src/health.ts`) reporting
  `{oracle, connector, connectorVersion, protocolVersion}` over plain HTTP.
- **`TenantConnectorPairing`** entity (`tenant_connector_pairings` table) —
  generates and stores a bcrypt-hashed pairing credential per tenant. Its
  own doc comment is explicit: *"generating and storing this credential is
  everything [it] does. Nothing yet CONSUMES it."* No registration
  endpoint reads this table; no transport authenticates against it.

What's genuinely missing (this is the actual scope of new work):

1. **No auth/handshake protocol.** A Connector today authenticates to
   Redis only via Redis's own connection auth (`CONNECTOR_REDIS_URL`) —
   not to a specific tenant, not via `TenantConnectorPairing`. Any
   Connector that can reach the shared Redis instance can, in principle,
   answer any tenant's requests.
2. **Only one query template exists** (`health-check-select-1` =
   `SELECT 1 FROM dual`) on both the Connector's `SqlTemplateRegistry` and
   the backend's `CloudOracleTransport.knownTemplates`. No production HIS
   queries (patient search, billing, etc.) are registered anywhere in this
   path.
3. **No WebSocket/interactive transport** — only Redis pub/sub, which
   works but has real trade-offs discussed below.
4. **No connector registry/fleet visibility** — no entity tracking "which
   connectors exist, which tenant they belong to, are they online," no
   admin UI surface for it (`PHASE_10_DEFERRED_BACKLOG.md` tracks this
   explicitly under "Connector fleet management").
5. **Never run against a real Oracle instance or real network topology.**
   Everything above is unit-tested with mocks. `ARCHITECTURE_STATUS.md`
   itself flags a real-world pilot as the top open item.
6. No Windows Service packaging, no auto-update mechanism, no offline
   queueing/durability strategy, no encrypted local secret storage — none
   of this exists yet in any form.

The rest of this document designs items 1–6, reusing 1 through the
existing Connector process, `IMessageTransport` abstraction, `OracleClient`
package, and `TenantConnectorPairing` entity rather than replacing them.
Where I disagree with a detail implied by the request (specifically: pure
WebSocket vs. the existing Redis-based transport), I say so explicitly and
explain why, rather than silently picking one.

## 1. Deployment models — confirmed, no change to self-hosted

```
Self-hosted (unchanged, always)
  Browser -> HDSP Backend (NestJS) -> OraclePoolManager -> Oracle HIS

Cloud (new)
  Browser -> HDSP Cloud Backend -> Connector Gateway -> [outbound-only link] -> HDSP Connector (in hospital network) -> Oracle HIS
```

`OraclePoolManager` (built tonight, Phase 3 of `CLOUD_VS_SELF_HOSTED_ROADMAP.md`)
remains exactly as built: self-hosted's default tenant always uses a
direct, local `OracleClient` pool from `.env`. This connector design does
**not** replace `OraclePoolManager` — it adds a second way a *cloud*
tenant can reach Oracle, alongside the direct-per-tenant-pool model shipped
tonight. Per your standing direction, direct Oracle stays the primary
architecture for cloud where the hospital allows an outbound-reachable
Oracle relay isn't needed; the Connector is for hospitals whose Oracle
cannot be reached at all (no VPN, no public endpoint, IT policy forbids
inbound rules) — i.e., `ORACLE_TRANSPORT` becomes a genuine per-tenant
choice (`direct` vs. `connector`), not an either/or architectural fork.
This should be reflected as a field on the `Customer`/`Hospital` record
from Phase 2, not a global env var, once built (see §11).

## 2. Technology stack recommendation

| Concern | Recommendation | Why |
|---|---|---|
| Connector runtime | Node.js + TypeScript, same as `connector/` today | Reuses `@hdsp/oracle-client` (native `oracledb` bindings, already solved for thick/thin mode, retry, circuit breaker) without a second Oracle driver in a different language. Rewriting this in Go/Rust/.NET buys nothing and duplicates real, working code. |
| Oracle driver | `@hdsp/oracle-client` (existing package), unchanged | Already extracted specifically so `connector/` and `backend/` share it (see that package's own doc comment). |
| Wire protocol, connector-facing | WebSocket (WSS), new | See §5 for the full trade-off discussion — Redis pub/sub as it exists today would require exposing Redis itself to the internet, which is the wrong shape for an internet-facing edge. |
| Internal durability | Keep Redis/BullMQ, backend-internal only | Redis never needs to be reachable from the hospital network if WSS is the connector-facing hop; BullMQ is already a first-class dependency in `backend` (`@nestjs/bull`) and is the natural place for "queue a job for connector X, durably survive a backend restart." |
| Windows Service | `node-windows` (npm package) for v1 | Well-established, MIT-licensed, wraps a Node script as a real Windows Service (auto-start, recovery-on-crash via `sc.exe` config), no native compilation required beyond what `oracledb` already needs. |
| Linux (later) | systemd unit file + the same Node binary | Node itself is already cross-platform; only the "install as a service" step differs per OS. Defer actual Linux packaging until a real Linux hospital deployment is scoped — don't build it speculatively (same principle the codebase already applies to per-tenant Oracle pooling). |
| Packaging/distribution | `pkg` (or Node's own single-executable-application feature, now stable in current LTS) to produce one self-contained binary per platform | Hospital IT should not need to run `npm install` or trust a live npm registry pull on a locked-down machine. One signed `.exe`, no Node.js pre-install dependency. |
| Local secret storage | OS keychain via `keytar` (Windows Credential Manager backing), fallback to a machine-bound AES-encrypted file if `keytar` is unavailable | Avoids inventing a bespoke encryption scheme; Windows Credential Manager is the standard place for "a service needs a secret at rest" on Windows. |
| Update package signing | `minisign` or plain RSA-SHA256 detached signature + SHA-256 checksum | Small, auditable, no dependency on a full PKI/code-signing-cert workflow for v1 (a real Authenticode cert can be layered in later without changing this design). |

## 3. Connector project structure

Builds on the existing `connector/` package rather than a new one:

```
connector/
  src/
    connector.ts                  (existing — Oracle + transport wiring, unchanged)
    index.ts                      (existing entrypoint — extended, see below)
    health.ts                     (existing — extended: adds connector status: online/reconnecting)
    protocol/
      message-transport.interface.ts   (existing — unchanged contract)
      sql-template-registry.ts          (existing — extended: loaded from a manifest pushed by cloud, not hardcoded)
      job.ts                             (NEW — job envelope: jobType, correlationId, payload)
    transport/
      redis-message-transport.ts   (existing — kept, but demoted to "internal/dev only," see §5)
      websocket-message-transport.ts (NEW — the real connector-facing transport)
    auth/
      registration.ts              (NEW — first-boot pairing-key registration flow)
      token-store.ts                (NEW — encrypted local storage of the connector token, via keytar)
    config/
      local-config.ts               (NEW — reads/writes the installer-provided config: tenant code, cloud URL, Oracle creds)
      installer-prompt.ts            (NEW — interactive first-run setup, used by the Windows Service installer)
    update/
      update-checker.ts              (NEW — compares reported version against cloud's advertised version)
      update-installer.ts            (NEW — download, verify signature/checksum, stage, restart)
    service/
      windows-service.ts              (NEW — node-windows wrapper: install/uninstall/start/stop)
  package.json
  VERSIONING.md, COMPATIBILITY.json   (existing — versioning/compat scheme already established)
```

## 4. Backend changes required

New `ConnectorModule` (`backend/src/modules/platform/connector/`), mirroring
the structure of existing platform modules (`tenant/`, `licensing/`):

- **`ConnectorRegistrationController`** — `POST /connector/register`
  (consumes a `TenantConnectorPairing` pairing key, one-time, issues the
  first connector token + a persistent connector credential),
  `POST /connector/token/refresh` (rotates a near-expiry connector token
  using the persistent credential, same refresh-token shape already used
  for real user sessions in this app).
- **`ConnectorGatewayService`** — a NestJS WebSocket Gateway (same pattern
  as `TokenGateway`, already in this codebase — reuse its
  connect/authenticate/room-per-tenant shape rather than inventing a new
  one). One WSS endpoint (`wss://cloud/connector`), authenticated via the
  connector token at handshake, one connector per tenant per connection
  (a tenant could in principle run more than one Connector for HA — out of
  scope for v1, but the entity model in §11 doesn't preclude it).
- **`ConnectorJobDispatchService`** — wraps `@nestjs/bull`: enqueues a job
  addressed to `(tenantId, connectorId)`, the Gateway's `onModuleInit`
  registers a Bull processor that, when a job is dequeued, checks whether
  that tenant's connector is currently connected; if yes, sends it over
  the live WebSocket and resolves the Bull job on response (or timeout →
  retry, using Bull's existing retry/backoff config, already a pattern
  this codebase uses elsewhere); if the connector is offline, the job
  simply stays queued (Bull's durability), no bespoke offline-buffer logic
  needed on the backend side.
- **`ConnectorStatusService`** — tracks online/offline/reconnecting per
  connector (in Redis, short-TTL heartbeat keys — same shape as existing
  presence-style Redis keys in this codebase, e.g. `token_locations`'
  caching), and exposes it to the Vendor Portal's Customer management
  screen (Phase 2's unified Customers view — a natural place to surface
  "Connector: Online, last seen 4s ago").
- **`CloudOracleTransport`** — updated to use the new
  `WebSocketMessageTransport` for a tenant configured with
  `oracleTransportMode: 'connector'` instead of always reading a single
  process-wide `ORACLE_TRANSPORT` env var — this makes the choice
  per-tenant (a `Hospital`/`Customer` column, see §11), consistent with
  tonight's Phase 3 direction of "direct Oracle is the default; connector
  is an option for tenants that need it," not a deployment-wide flag.

New entities:

- **`ConnectorInstance`** (`connector_instances` table): `id`, `tenantId`,
  `pairingId` (FK to `TenantConnectorPairing`, finally consumed),
  `status` ('registered' | 'online' | 'offline' | 'revoked'), `version`,
  `lastHeartbeatAt`, `hostname` (self-reported, informational only),
  `createdAt`. This is what `PHASE_10_DEFERRED_BACKLOG.md`'s "Connector
  fleet management" gap asks for.
- **`ConnectorTokenGrant`** (or reuse the existing refresh-token table
  pattern if one already exists for users — needs a quick check before
  building; if a generic "opaque long-lived credential + rotation"
  primitive already exists elsewhere in this codebase, prefer extending it
  over adding a parallel one).

## 5. Communication protocol — WebSocket vs. SSE vs. the existing Redis transport

You asked me to investigate WebSocket vs. SSE. The real decision is
three-way, because Redis pub/sub already exists and works. Here's the
comparison:

**Redis pub/sub (existing `RedisMessageTransport`).** Works today,
zero new code. But the connector authenticates to Redis itself, not to a
specific tenant's channel — Redis ACLs *can* scope a connector to only its
own channel, but that means provisioning a Redis ACL per tenant, which is
real operational surface area most Redis-as-a-service offerings make
awkward. More fundamentally: for this to satisfy "no inbound firewall rule
on the hospital side," Redis itself must be reachable from the hospital
network over the internet — meaning a production Redis instance, exposed
publicly (even behind TLS+auth), becomes part of the internet-facing
attack surface. That's a meaningfully different risk profile than "a
single WSS endpoint behind the same load balancer/WAF/rate-limiting that
already fronts the rest of the API." I'd keep Redis, but move it back
inside the trust boundary — internal job durability only, never
internet-facing (see `ConnectorJobDispatchService` above).

**Server-Sent Events (SSE).** One-directional (server → client) only. The
Connector needs to both receive jobs (server → connector) and return
results (connector → server) with low latency for interactive lookups
(patient search while a nurse is waiting on a screen). SSE would need a
second, separate HTTP POST channel for the connector → cloud direction,
which reintroduces exactly the "does the hospital allow this outbound
request" question WebSocket already answers in one connection, plus loses
built-in reconnect/backoff semantics a good WebSocket client library
already gives you. SSE is the wrong fit here — it's designed for
notification streams, not bidirectional RPC.

**WebSocket (recommended).** Single outbound TCP connection (as WSS, so it
looks like ordinary HTTPS traffic to any hospital firewall/proxy — no new
port, no protocol most IT departments will flag), full duplex, and maps
directly onto the *already-designed* `IMessageTransport` interface's
`send()`/`onRequest()` shape — this is precisely the interactive-lookup
transport that interface's own doc comment predicted would be needed.
Concretely: `WebSocketMessageTransport implements IMessageTransport`,
swapped in on both the Connector side and (via `CloudOracleTransport`) the
backend side, with zero changes to `Connector`'s own code (`connector.ts`
doesn't know or care which transport it's given — this is the whole point
of that interface existing).

**Recommendation:** WebSocket (WSS) is the connector-facing transport.
Redis/BullMQ stays as internal backend job durability, never exposed to
the hospital network. This is additive to the existing `IMessageTransport`
design, not a replacement of it.

> **Superseded terminology (2026-07-22, see §16):** §6/§7 below describe
> the original design under the name "Pairing Key" — a 43-character opaque
> token, always paired with a separately-entered Tenant Code. That flow was
> replaced during the Onboarding UX redirect: the hospital-facing term and
> the actual credential format are now the **Activation Code** (12
> human-typeable characters, e.g. `ABCD-EFGH-JKLM`), and `tenantCode` is
> now optional at redemption (a global pending-code scan resolves the
> tenant). The *shape* of the flow described below (one-time credential,
> bcrypt-hashed at rest, single-use, flips `TenantConnectorPairing.status`
> pending -> active) is unchanged and still accurate — only the credential
> format, the requirement to also know a separate tenant code, and the
> product-facing name changed. See §16 for the current, implemented
> design and the finalized Vendor Portal API contract.

## 6. Authentication flow

```
Install time (hospital IT, guided by the Windows Service installer):
  Admin enters: Tenant Code, Pairing Key (one-time, generated in Vendor Portal), Cloud URL

First boot:
  Connector -> POST https://cloud/connector/register
               { tenantCode, pairingKey }
  Backend:   bcrypt-compares pairingKey against TenantConnectorPairing.pairingKeyHash
             for that tenant; on match, flips status pending -> active,
             creates a ConnectorInstance row, issues:
               - a short-lived connector JWT (e.g. 15 min, used for the WSS handshake)
               - a long-lived connector refresh credential (stored locally, encrypted)
  Connector: stores both via token-store.ts (keytar-backed), discards the
             pairing key from memory immediately (never persisted).

Every reconnect:
  Connector -> WSS handshake, Authorization: Bearer <connector JWT>
  If JWT expired: Connector -> POST /connector/token/refresh using the
                  long-lived refresh credential, gets a new short-lived JWT, retries handshake.

Rotation / revocation:
  Vendor Portal admin action -> ConnectorInstance.status = 'revoked' ->
  next refresh attempt is rejected -> Connector reports a clear
  "credentials revoked, contact your administrator" state in its local
  logs and health endpoint, stops retrying (don't hammer a revoked
  credential in a reconnect loop).
```

This reuses the exact bcrypt-hash-at-rest, shown-once pairing-key pattern
`TenantConnectorPairing` already implements — it just finally gets a
consumer, per its own documented gap.

## 7. Connector registration flow

1. Vendor Portal admin opens a tenant's Customer page (Phase 2's unified
   view), clicks "Generate Connector Pairing Key." Backend creates a
   `TenantConnectorPairing` row (already-existing code path, Task 10.4),
   returns the raw key once, displayed with a "copy now, this won't be
   shown again" warning (same UX convention as instance tokens elsewhere
   in this app).
2. Hospital IT runs the installer on a machine inside the hospital network
   with a route to the Oracle server. Installer prompts for Tenant Code,
   Pairing Key, Cloud URL (defaults to the production cloud URL, overridable
   for staging), and Oracle connection details (host/port/service/user/
   password) — all written to the local encrypted config.
3. Installer registers the Windows Service (`node-windows`), starts it.
4. Connector performs the first-boot registration (§6), connects to
   Oracle locally, opens the WSS connection, and reports healthy.
5. Vendor Portal's Customer page shows "Connector: Online" — closing the
   loop the pre-connector world never had (a cloud tenant provisioned
   today has no visibility into whether Oracle connectivity works at all
   until someone tries a query and it fails).

## 8. Job execution protocol

Extends the existing `MessageTransportRequest`/`Response` shapes with a
`jobType` envelope rather than replacing them — every job type below
ultimately resolves to "execute a registered template with these bind
parameters," which is exactly what `Connector.handleRequest()` already
does:

```ts
interface JobRequest {
  correlationId: string;
  jobType: 'EXECUTE_QUERY' | 'SYNC_METADATA';
  sqlTemplateId?: string;   // required when jobType === 'EXECUTE_QUERY'
  binds?: Record<string, unknown>;
}
```

"Patient Search," "Appointment Search," "Billing Lookup," "Doctor Lookup,"
"Token Queries," and "Execute HIS Query" from the request are not distinct
protocol-level job types — they're distinct **registered query template
IDs** (`sql.patient.search`, `sql.appointment.search`, etc. — the same
naming convention `HIS_SCHEMA_DEFAULTS`'s `SQL_QUERIES` category already
uses today), all dispatched as `EXECUTE_QUERY` jobs. Collapsing them into
one job type keeps the protocol small and means adding a new supported
query later is a config change (register a new template) not a protocol
change. `SYNC_METADATA` is the one genuinely different job type — see §9.

## 9. Query synchronization protocol

Source of truth: the tenant's `SQL_QUERIES`-category rows in HDSP backend's
own `his_schema_config` table — now tenant-scoped as of tonight's Phase 3
work (`HisConfigService`), so this doesn't need new storage.

```
On connect (and whenever an admin edits a query in HIS Configuration):
  Backend -> Connector: { jobType: 'SYNC_METADATA', templates: [
    { sqlTemplateId, sql, kind: 'query' | 'execute', paramSpec: [...] },
    ...
  ]}
  Connector: SqlTemplateRegistry.replaceAll(templates)  (NEW method —
             today's registry only supports register() at construction
             time; needs a runtime-replace path)
  Connector: acks with a checksum of the applied template set, so the
             backend can confirm sync succeeded, not just "message sent."
```

This is a natural extension of `SqlTemplateRegistry` — the allow-list
concept doesn't change, only its source (hardcoded today, cloud-pushed
going forward).

## 10. Auto-update design

```
Heartbeat (connector -> backend, every N seconds over the existing WSS connection):
  { connectorId, version, oracleAvailable, timestamp }

Backend compares `version` against a configured minimum/recommended
version (global default + optional per-tenant override, for staged
rollouts). If outdated, the heartbeat ACK includes:
  { updateAvailable: true, version: '1.3.0', downloadUrl, sha256, signatureUrl }

Connector (update-checker.ts):
  1. Downloads the package to a temp/staging directory.
  2. Verifies SHA-256 checksum, then the detached signature against a
     pinned public key baked into the current connector binary (never
     fetched at update time — a compromised update server can't also
     forge the trust root).
  3. On success, hands off to a small separate updater helper process
     (required on Windows: a running executable cannot overwrite itself).
     The updater stops the Windows Service, replaces files, restarts it,
     and reports success/failure back on next connect.
  4. On any verification failure, the update is discarded and logged
     locally; the running connector is untouched. Never auto-apply an
     unverified package.
```

## 11. Local configuration design

```
{
  "tenantCode": "MOSC",
  "cloudUrl": "https://cloud.hdsp.com",
  "connectorId": "<uuid, assigned at registration>",
  "logLevel": "info",
  "healthPort": 4100
}
```

stored as plain (non-secret) local JSON. Secrets — the connector refresh
credential and Oracle `host/port/service/user/password` — stored
separately via `keytar` (Windows Credential Manager), never in the plain
config file, never logged. This mirrors the existing convention elsewhere
in this codebase of never persisting raw secrets (bcrypt hashes, "shown
once" tokens) — same principle, applied to a local machine's credential
store instead of a database.

## 12. Offline synchronization strategy

- **Backend → Connector direction:** handled entirely by keeping
  `ConnectorJobDispatchService`'s queue in BullMQ (already durable, already
  survives a backend restart). A job for an offline connector simply waits;
  no bespoke "offline buffer" needed on the backend.
- **Connector → Backend direction (heartbeats, logs, job results for jobs
  it was mid-processing when disconnected):** a small bounded local disk
  queue (e.g. a size-capped JSONL file, oldest-dropped-first) — this is
  new code, but simple; results for jobs already completed before a
  disconnect are flushed on reconnect, correlated by the same
  `correlationId` the backend is still waiting on (assuming the backend's
  wait timeout hasn't already expired and requeued the job — in which
  case the late result is discarded, logged, not applied twice).
- **Local Oracle continues to work regardless of cloud connectivity** —
  this is automatic, since the Connector's Oracle pool (`OracleClient`) is
  entirely independent of the WSS connection's state. Nothing about this
  design makes local Oracle availability depend on cloud reachability.
- Reconnection: exponential backoff (e.g. 1s, 2s, 4s, 8s... capped at 60s),
  jittered to avoid a thundering herd if the cloud gateway itself briefly
  restarts and many connectors reconnect simultaneously.

## 13. Security model

- TLS 1.2+ for all connector-facing traffic (WSS, the registration REST
  endpoint, the update download endpoint).
- Connector authenticates via a short-lived JWT + long-lived refresh
  credential (§6) — no long-lived bearer token sent on every message.
- Oracle credentials never transmitted to the cloud, ever, in either
  direction — the cloud only ever sends `sqlTemplateId` + bind parameters;
  the Connector resolves the actual SQL and executes it entirely locally.
  This is already true of the existing `MessageTransportRequest` shape and
  must not regress when extended to the `JobRequest` envelope in §8.
- No inbound ports on the hospital side — the Connector only ever
  initiates outbound connections (WSS to cloud, TCP to the local Oracle
  server). Confirm this explicitly in the deployment guide, since it's the
  hospital IT department's primary security question.
- Signed, checksummed update packages, verified against a pinned public
  key baked into the binary (§10) — an update server compromise alone
  cannot push malicious code to connectors without also forging the
  signature.
- Encrypted local secrets via OS keychain, not plaintext config (§11).
- Rate-limited, audited registration endpoint — reuse the existing
  `@Throttle()` pattern already applied to `SetupController`'s vendor
  registration endpoint, and log registration/rotation/revocation events
  through the existing `AuditService`, consistent with how every other
  sensitive action in this app is already audited.
- Per-tenant isolation of the WSS gateway: a connector authenticated for
  tenant A can only be dispatched tenant A's jobs and can only respond on
  tenant A's correlation IDs — enforced the same way `TenantContextStorage`
  enforces isolation elsewhere in this codebase (ambient tenant established
  at connection time from the validated JWT, never trusted from a
  client-supplied field).

## 14. Deployment guide (outline — full guide written once implementation lands)

1. Vendor Portal: generate a pairing key for the tenant.
2. Download the signed connector installer for the target OS.
3. Run the installer on a machine with network access to both the Oracle
   server (inbound-side, hospital-internal) and the internet (outbound,
   port 443 only — no special firewall rule needed since it's ordinary
   HTTPS/WSS).
4. Enter tenant code, pairing key, Oracle connection details.
5. Installer registers and starts the Windows Service.
6. Verify in Vendor Portal: Customer page shows "Connector: Online."
7. Confirm HIS-backed features work for that tenant end-to-end (same bar
   as this session's earlier self-hosted smoke-test list: patient search,
   billing lookup).

## 15. Phased implementation plan

- **Phase A — Registration + auth.** Consume `TenantConnectorPairing`
  (finally). New `ConnectorRegistrationController`, `ConnectorInstance`
  entity, connector-side `registration.ts`/`token-store.ts`. No transport
  changes yet — can be built and tested independently.
- **Phase B — `WebSocketMessageTransport`.** New `IMessageTransport`
  implementation, both sides. `CloudOracleTransport` gains a
  `'connector'` mode alongside existing `'direct'`/`'cloud_relay'`,
  feature-flagged per tenant, off by default — zero risk to any existing
  deployment until explicitly enabled for a specific tenant.
- **Phase C — Status + heartbeat.** `ConnectorStatusService`, heartbeat
  protocol, Vendor Portal "Connector: Online/Offline" surfacing on the
  Customer page.
- **Phase D — Query registry sync.** `SYNC_METADATA` job type,
  `SqlTemplateRegistry.replaceAll()`, wiring to the tenant's existing
  `SQL_QUERIES` config rows.
- **Phase E — Durability.** `ConnectorJobDispatchService` on BullMQ, local
  disk-backed result buffer on the Connector side, reconnect draining.
- **Phase F — Packaging.** Windows Service installer, `pkg`-based
  single-binary distribution, encrypted local secret storage.
- **Phase G — Auto-update.** Signing pipeline, update-checker,
  updater-helper process, staged rollout support.
- **Phase H — Pilot.** One real tenant, one real Oracle instance, real
  hospital network topology — closing the gap `ARCHITECTURE_STATUS.md`
  already flags as the top open item for everything this connector builds
  on.

Each phase should ship independently gated (per-tenant flag, not a global
switch), matching this session's established discipline of shipping
tenant-isolation-sensitive work incrementally and verifiably rather than
as one large cutover.

## 16. Onboarding UX redirect — Activation Code flow + Vendor Portal Connector Management (2026-07-22)

Phases A–C above (registration/auth, transport, status) shipped as
originally planned (D.1–D.6 in `DYNAMIC_HIS_QUERY_ARCHITECTURE.md`, plus
`ConnectorRegistrationService`/`ConnectorGateway`/`ConnectorDirectoryService`).
Partway through, the product requirement changed: a hospital IT user
cannot realistically be handed a 43-character opaque token and a separate
tenant code, install Node.js, edit a `.env` file, or run `npm start` from a
terminal. The connector needed to become an actual installable Windows
product, and Vendor Portal needed to become the place a support engineer
manages it end-to-end — "support never logs into the hospital machine."
This section records what actually shipped for the first two pieces of
that redirect (Activation Flow backend; Vendor Portal Connector
Management); the Connector Installer, local Configuration UI, and Windows
Service packaging (§15 Phases F/G, tasks #95/#96/#103) are not yet built.

### 16.1 Activation Code (replaces "Pairing Key" terminology)

- **Format**: 12 characters from a 32-symbol Crockford-base32-style
  alphabet (no `0`/`O`/`1`/`I`/`L`), grouped 4-4-4 with dashes, e.g.
  `ABCD-EFGH-JKLM` (`connector-activation-code.util.ts`,
  `generateActivationCode()`). ~60 bits of entropy, combined with
  single-use redemption, a 72-hour expiry (`TenantConnectorPairing
  .expiresAt`, new column), and the pre-existing 5/hour IP rate limit on
  `POST /connector/register`.
- **`tenantCode` is now optional** at redemption
  (`ConnectorRegistrationService.register()`): when omitted, the service
  does a global scan across every tenant's currently-`pending`,
  non-expired codes rather than requiring the caller to already know which
  tenant it belongs to — this is what lets a hospital's Connector present
  a single "enter your Activation Code" field with nothing else to type.
  `tenantCode` scoping is still supported for any caller that already has
  it (unchanged, narrower/faster lookup) — additive, not a breaking
  change.
- **Normalization**: `normalizeActivationCode()` uppercases and strips
  everything outside the alphabet before hashing/comparing, so
  `"abcd-efgh jklm"`, `"ABCDEFGHJKLM"`, and `"abcd-efgh-jklm"` all match
  identically — the credential is designed to survive being typed,
  pasted, or read aloud over a phone call to support.
- **Generate vs. Regenerate**: one backend operation
  (`TenantProvisioningService.regenerateConnectorActivationCode()`) serves
  both — it revokes any stale pending code for the tenant first (a no-op
  if none exists) and issues a fresh one. There is no separate "generate
  for the first time" endpoint; the Vendor Portal UI just picks the label
  that fits what it already knows about the tenant's connector state.
- **Activation flow, end to end**: Vendor Portal generates an Activation
  Code -> hospital installs the Connector -> hospital enters the code
  (nothing else) -> Connector calls `POST /connector/register` with just
  the code -> backend resolves the tenant, issues a connector JWT ->
  Connector opens its WebSocket -> `HisQueryDefinitionPublisherService`'s
  `'connected'` handler enqueues a full definition sync automatically
  (unchanged from D.6, §17 of the query-architecture doc) -> Vendor
  Portal's Connector page flips to "Online."

### 16.2 Vendor Portal Connector Management (Task #102)

New endpoints on HDSP's `TenantProvisioningController`
(`platform/tenant-provisioning`, `VendorPortalApiKeyGuard`-gated, same
additive JWT-or-API-key auth path every other route on that controller
already uses):

| Route | Purpose |
|---|---|
| `GET tenants/:tenantId/connector` | Status + health summary (registered/online, hostname, version, last seen, registered date, published-definitions count + last-compiled time). `registered: false` is a normal pre-activation state, not an error. |
| `GET tenants/:tenantId/connector/activity` | Recent connector-lifecycle audit history (`AuditService.findRecentForTenant()`, its first-ever read method), filtered to a fixed action allow-list, not a general tenant audit-log viewer. |
| `POST tenants/:tenantId/connector-activation-code/regenerate` | Generate/regenerate — see §16.1. Now audit-logged (`CONNECTOR_ACTIVATION_CODE_REGENERATED`), which it wasn't before this task. |
| `POST tenants/:tenantId/connector/republish` | Manual "Republish Query Definitions" — delegates to the same `HisQueryDefinitionPublisherService.publishFull()` that `LicenseController`'s internal-admin route already used (D.6, §17 of the query-architecture doc); no publish logic duplicated, only the thin controller/guard layer, so a support engineer never needs an internal HDSP admin JWT to trigger one. |
| `POST tenants/:tenantId/connector/resync` | "Force Connector Resync" — same duplication rationale, mirrors `LicenseController`'s existing resync route. |
| `GET connector-installer` | Installer version/download info. Config-driven (`CONNECTOR_INSTALLER_VERSION`/`CONNECTOR_INSTALLER_DOWNLOAD_URL`/`CONNECTOR_INSTALLER_NOTES` env vars), not a database-backed releases table — there is exactly one current build at any time, and no build exists yet (Task #96 not started), so this honestly reports `{ available: false }` today. Not tenant-scoped. |

Vendor Portal's own backend (`vendor-portal/backend`, a separate NestJS
app on its own port — see its `CloudTenantsService`) proxies every one of
these through new methods that mirror the HDSP response shapes exactly
(`getConnectorStatus`, `getConnectorActivity`,
`republishConnectorDefinitions`, `resyncConnector`,
`regenerateConnectorActivationCode`, `getConnectorInstaller`), reached via
new routes on its `CloudTenantsController`
(`/cloud-tenants/:id/connector*`, `/cloud-tenants/connector-installer`).
The Vendor Portal frontend never calls HDSP directly and HDSP's internal
endpoints are never exposed to the browser — same shape as every other
cloud-tenant operation in that app (`provision`, `deprovision`,
`releaseSubdomain`).

Frontend: a `ConnectorManagementCard` on the Cloud Tenant detail page
(`vendor-portal/frontend/src/app/(vendor)/cloud-tenants/[id]/`) —
status/health panel, Download Installer button (disabled with a tooltip
when unavailable), Generate/Regenerate Activation Code (one-time-reveal
dialog, same convention as the temporary SUPER_ADMIN password shown at
provisioning time), Republish Query Definitions, Force Connector Resync
(disabled while offline), and a recent-activity list. "Activation Code" is
the only term used anywhere in this surface — no "Pairing Key" reference
remains in the Vendor Portal UI.

### 16.3 Explicitly not done in this pass

- No `ConnectorInstance.version`/heartbeat data yet (§15 Phase C's
  heartbeat protocol, task #93) — `getConnectorStatus()`'s `version`/
  `lastSeenAt` are honestly `null` until that ships; not synthesized here.
- No installer artifact exists (task #96) — `connector-installer` reports
  `available: false` rather than a fabricated link.
- No local Connector Configuration UI or system tray (task #103) — that
  is the next piece of this redirect, and is designed to consume exactly
  the same HDSP endpoints this section documents (the activation
  redemption call already exists and is unchanged by this task; the
  status/republish/resync reads aren't yet consumed by anything
  Connector-side, only by Vendor Portal).
- No Windows Service packaging or installer wizard (§15 Phases F/G, tasks
  #95/#96).

## 17. HDSP Connector Manager (Task #103, 2026-07-22)

The third piece of the Onboarding UX redirect (§16): "an application, not
a configuration page" that lets a hospital IT admin install, activate,
configure, diagnose, and maintain the Connector without a terminal. Three
new/changed pieces, all in this pass:

### 17.1 `ConnectorRuntime` -- boot flow redesign (`connector/src/runtime/connector-runtime.ts`)

`index.ts`'s old `main()` was a single linear boot sequence that threw at
startup if `CONNECTOR_TENANT_CODE`/`CONNECTOR_PAIRING_KEY` weren't already
set as environment variables -- workable for a developer running the
process by hand, useless for the product experience this task describes
("Enter the Activation Code" as a UI action, after the process is already
running). `ConnectorRuntime` replaces it with a restartable, event-driven
orchestrator:

- **Boot with no stored credentials is no longer fatal.** The process
  comes up, Oracle connects (or doesn't) exactly as before, the local REST
  API + Manager UI are served, and `GET /api/status` honestly reports
  `activated: false`. The cloud pipeline (WebSocket transport + `Connector`)
  simply hasn't started yet.
- **`activate(activationCode, hostname?)`** is a new, on-demand method --
  callable at any time after boot, called by `POST /api/activation` (in
  turn called by the Manager UI's Activation page). It redeems the code
  (§16.1's activation flow, unchanged), persists credentials via the
  existing `TokenStore`, and starts the pipeline immediately -- no process
  restart. Guards against double-activation (throws, mapped to HTTP 409).
- **Oracle config is now sourced from `OracleConfigStore` (§17.2)
  first**, falling back to `ORACLE_*` env vars only for local/CI developer
  convenience -- production activation never touches an env var for
  Oracle settings.
- **`reconnect()`/`restart()`** back the Dashboard/tray actions.
  `restart()` is explicitly scoped to the in-process pipeline (Oracle pool
  + WebSocket transport), not the Windows Service/OS process -- true
  service-level restart needs the installer (§15 Phase F, task #95),
  which doesn't exist yet; the doc comment on `restart()` says so rather
  than pretending otherwise.

Bug fixed in the same pass: `registration.ts`/`index.ts` still spoke the
OLD `{tenantCode, pairingKey}` wire shape from before §16's Activation
Code redirect -- the backend's `RegisterConnectorDto` (Task #101) had
already moved to `{tenantCode?, activationCode}`, so the Connector's
registration call would have 400'd against production. Fixed as part of
this task since Task #103's acceptance criteria depends entirely on
activation actually working end-to-end.

### 17.2 Secure Oracle credential storage (`connector/src/config/oracle-config-store.ts`, `connector/src/security/`)

Explicit requirement: no plain JSON/`.env` for Oracle credentials entered
via the UI. `SecureJsonStore` picks a backend by platform:

- **win32**: real Windows DPAPI (`security/dpapi.ts`), via
  `System.Security.Cryptography.ProtectedData`, `CurrentUser` scope,
  invoked through a `powershell.exe` child process rather than a native
  npm addon (`keytar` et al.) -- same reasoning `TokenStore` already
  documented for its own credential file: no Windows machine in this
  sandbox to verify a native module builds/links there, and PowerShell
  ships with every supported Windows version, so this has zero extra
  install footprint. This is real DPAPI, the same OS primitive `keytar`
  itself calls into -- not a workaround.
- **everywhere else** (this sandbox, Linux/macOS dev machines): the same
  AES-256-GCM-with-a-local-key-file approach `TokenStore` already uses,
  explicitly a dev-only fallback (see that class's own honest-limitation
  doc comment, which applies identically here).

`TokenStore` itself was deliberately left untouched in this pass (still
AES-256-GCM everywhere, not DPAPI-on-Windows) -- upgrading it is a
natural, low-risk follow-up, not bundled into this task's explicit
Oracle-credential scope, per this project's standing rule against mixing
unrelated refactors into feature work.

### 17.3 Local REST API (`connector/src/api/local-api-server.ts`)

Binds `127.0.0.1` only -- never `0.0.0.0` -- per the task's explicit
security requirement. No auth on these routes: the trust boundary is "can
this process reach 127.0.0.1 on this machine," matching every other
localhost-only local admin UI (Docker Desktop, most local dev servers),
not a gap. Routes (all under `/api/*` except the legacy `/health`, kept
byte-compatible):

| Route | Backs |
|---|---|
| `GET /api/status` | Dashboard (cloud/Oracle/definitions/version/last sync) |
| `GET`/`POST /api/activation` | Activation page |
| `POST /api/reconnect`, `POST /api/restart` | Dashboard/tray actions |
| `GET`/`PUT /api/oracle/config`, `POST /api/oracle/test` | Oracle page (password never echoed back -- `redactOracleConfig()`) |
| `GET /api/diagnostics`, `GET /api/diagnostics/export` | Diagnostics page (one-click check + downloadable JSON report) |
| `GET /api/logs` | Logs page (in-memory `LogBuffer`, filterable by level) |
| `GET /api/about` | About page |
| `GET /api/update/check` | Stub -- `{updateAvailable: false}`, honest until Task #97 (auto-update) exists |

Also serves the built Manager UI (§17.4) as static files from the SAME
port -- one thing to point a browser or the tray at, no CORS. Designed to
stay additive-only (per the task's "future compatibility" requirement) so
heartbeat visualization, auto-update progress, and fleet diagnostics can
land as new/extended fields later without a breaking change.

### 17.4 HDSP Connector Manager UI (`connector-manager/`, new package)

A Vite + React SPA (chosen over Next.js: this is a small, build-once,
serve-as-static-files app with no server-rendering need, and over
Electron/`.NET`/WPF per the earlier, already-confirmed "local web UI"
architecture decision) with six pages matching the task's spec exactly:
Dashboard, Activation, Oracle, Diagnostics, Logs, About. Talks ONLY to the
local REST API via relative URLs (`src/api.ts`) -- there is intentionally
no way to configure a different backend; the UI is always served by, and
only ever points at, the Connector Service on the same machine.
`HashRouter` (not `BrowserRouter`) so client-side page routes need no
server-side rewrite support beyond the SPA-fallback route
`local-api-server.ts` already has.

### 17.5 System tray (`connector-tray/`, new package)

**Architecturally significant correction made during this task**: the
tray icon CANNOT live inside the Connector Windows Service process. Since
Windows Vista, services run in Session 0, which has no desktop -- this is
an OS-enforced isolation, not a library limitation, and no tray-icon
package (including this one) can make a Session-0 process show UI in a
user's interactive session. `connector-tray/` is therefore its own tiny
process, meant to be started from the user's session (Start Menu shortcut
+ autostart entry -- Task #96, Connector Installer, owns wiring that up;
not built yet). Every menu action (Reconnect, Run Diagnostics, View Logs,
Check for Updates, Restart Connector) is an HTTP call to the SAME local
REST API the browser UI uses; "Open Connector Manager" opens the default
browser to it. Per the task's explicit requirement, "Exit Manager" kills
only this tray process -- the Windows Service is untouched and keeps
running. See `connector-tray/README.md` for the full rationale.

Uses `systray2` (a small prebuilt-binary wrapper, not Electron) -- there
is no pure-JS way to render a native OS tray icon. (Corrected 2026-07-22:
originally specified as `node-systray-v2`, which does not exist on the
npm registry -- caught by a real `npm install` 404 during Phase 2
validation on Windows. `systray2` is the actual maintained package; see
`connector-tray/README.md`'s "Dependency correction" note.)

### 17.6 Verification status -- honestly incomplete

**Not verified in this sandbox** (no Windows machine, no real Oracle
instance, no real HDSP cloud tenant to activate against):

- The DPAPI backend (`security/dpapi.ts`) -- only the non-Windows AES-GCM
  fallback has test coverage (`security/__tests__/secure-json-store.spec.ts`).
- `systray2`'s actual tray-icon rendering (`connector-tray/`) --
  code-reviewed against the package's documented API shape, not run.
- The full acceptance workflow (§103's 11-step list: install -> launch ->
  activate -> configure Oracle -> Test Connection -> Save -> auto-register
  -> WebSocket -> definition sync -> Dashboard "Connected") end-to-end on
  a real machine.
- `npm install`/`npm run build` for all three touched/new packages
  (`connector/`, `connector-manager/`, `connector-tray/`) -- this
  sandbox's mounted-drive npm installs have repeatedly timed out this
  session (same limitation noted for the main backend and vendor-portal
  packages earlier); none of these three have a `node_modules/` in this
  sandbox as of this task.

**Verified by code review and unit tests** (against mocks, not live
infrastructure): the local REST API's request/response contract
(`api/__tests__/local-api-server.spec.ts`, via `supertest` against a
mocked `ConnectorRuntime`), the secure-store round-trip on the fallback
backend, the `pairingKey`→`activationCode` wire-format fix, and the
overall runtime/API/UI wiring by direct inspection of every call site.

Task #95/#96 (Windows Service packaging, installer) remain the natural
next step -- they're what would let this be run and verified end-to-end
on a real machine, and what wires up the tray's autostart per §17.5.

## 18. HDSP Connector 1.0 Deployment (Tasks #118-122, 2026-07-22)

Following §17, the connector's feature set was declared frozen at 1.0 and
the work shifted from R&D to shipping: versioning discipline, a
Program-Files/ProgramData installation split, an NSSM-based Windows
Service, and an Inno Setup installer. This section documents that
discipline and points to the validation runbooks that replace further
feature work for now.

### 18.1 Versioning

- **Connector product version**: `1.0.0` (`connector/package.json`,
  `connector-manager/package.json`, `connector-tray/package.json`,
  `connector-installer/package.json`).
- **Installer artifact**: `HDSP_Connector_1.0.0_x64.exe`
  (`connector-installer/HDSP_Connector.iss`'s `OutputBaseFilename`).
- **Connector Protocol**: `v1` (`PROTOCOL_VERSION = '1'` in
  `connector/src/health.ts`, unchanged this pass).
- **Local REST API**: `v1`, mounted at `/api/v1/*`
  (`connector/src/api/local-api-server.ts`'s `buildV1Router()`). `/health`
  stays unversioned/legacy -- it predates the v1 API and has a different
  response shape. Since nothing has shipped yet, there was no live
  unversioned `/api/*` consumer to preserve; this was a clean rename, not
  a migration with a deprecation window. A future breaking change to the
  local API contract gets `/api/v2` mounted alongside `/api/v1`, not a
  replacement of it -- so older Connector Manager builds (e.g. from a
  hospital that hasn't updated the UI yet) keep working against the
  Service they're paired with.

The rule going forward: every one of these four version numbers
(product, installer filename, protocol, local API) is bumped and recorded
deliberately, not left to drift -- a support engineer looking at a
hospital's `/api/v1/about` response and an installer filename should be
able to tell exactly what's running without guessing.

### 18.2 Installation layout

```
C:\Program Files\HDSP Connector\        <- static, versioned, replaced wholesale on upgrade
    connector.exe                       <- pkg'd Node 18 runtime + compiled connector/
    tray.exe                            <- pkg'd Node 18 runtime + compiled connector-tray/
    nssm.exe                            <- third-party, downloaded, not vendored
    manager-ui\                         <- connector-manager's built static assets
    install-service.exe                 <- pkg'd, run once by the installer
    uninstall-service.exe               <- pkg'd, run once by the uninstaller
    uninstall.exe                       <- Inno Setup's generated uninstaller

C:\ProgramData\HDSP\Connector\          <- mutable, survives upgrades
    credentials.enc.json                <- TokenStore (activation JWTs)
    store.key                           <- TokenStore's local key (non-Windows fallback only)
    oracle-config.enc.json              <- OracleConfigStore (DPAPI-encrypted on Windows)
    logs\service.log                    <- NSSM's redirected stdout/stderr
```

This split already existed implicitly from Task #103 (`OracleConfigStore`
and `TokenStore` both default their config directory to
`%ProgramData%\HDSP\Connector`); this task formalized it as an explicit
installer contract and documented it in `connector-installer/README.md`.
The payoff: an upgrade installer can overwrite everything under Program
Files without touching a hospital's activation state or Oracle
credentials, and an uninstall can offer to keep that state for a later
reinstall (see `HDSP_Connector.iss`'s `[Code]` section).

### 18.3 Packaging pipeline

`connector/` and `connector-tray/` are each bundled by `pkg` (Node 18 +
compiled JS -> one `.exe`, no Node.js prerequisite on the hospital's
machine) into `connector-installer/build/{connector,tray}.exe`.
`connector-manager/`'s Vite build output is copied in as static files and
served by `connector.exe` itself -- it does not need its own process or
executable. The Windows Service is registered via NSSM (chosen over
`node-windows` because `connector.exe` is now a standalone binary, not a
raw Node script that a Node-based service wrapper could `require()`
directly) by `install-service.exe`, itself a `pkg`'d wrapper around
`connector-installer/scripts/install-service.js` so the installer doesn't
need Node.js present either. `connector-installer/HDSP_Connector.iss`
ties it all together into `HDSP_Connector_1.0.0_x64.exe`. Full pipeline
diagram and build steps: `connector-installer/README.md`.

**Status: scaffolded, not verified.** Every piece above is code-complete
and reviewed but has not been compiled or run on a real Windows machine
in this sandbox (no Windows environment, no `iscc`, no way to produce or
execute a `pkg` Windows binary here). See §18.4 for the runbook that
closes this gap.

### 18.4 Phase 2/3 validation runbooks

Concrete, executable runbooks for the two phases this sandbox cannot run
itself -- clean-Windows-VM installer validation (Phase 2) and real
hospital pilot (Phase 3) -- are maintained separately in
`connector-installer/VALIDATION_RUNBOOKS.md` rather than duplicated here.
That document is the checklist a human (or QA) runs through on real
infrastructure; this architecture doc stays the record of what was built
and why.
