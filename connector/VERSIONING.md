# Connector Versioning & Compatibility Matrix

Phase 6 ("Connector"), Task 6.5 — establishes the release discipline from
`HDSP_Hybrid_Architecture_Specification_v2.0.md` Section 7.4/11 ahead of the
Connector's first real release in Phase 12. The Connector is not deployed
anywhere in Phase 6 — this document exists so the discipline is in place
*before* Phase 7 makes the backend depend on a real, running instance of it.

**Phase 12 (Task 12.5) update:** this file is now the human-readable
narrative; **`connector/COMPATIBILITY.json`** in this same directory is the
machine-readable source of truth, consumed by
`infrastructure/installer/check-compatibility.js` (run by `install.sh`
before pulling images for a self-hosted connector-relay install) and by
`build-images.yml`'s version-manifest job (Task 12.2). Keep both in sync —
this file explains *why* a row exists, `COMPATIBILITY.json` is what tooling
actually reads.

## Versioning scheme

`@hdsp/connector` and `@hdsp/oracle-client` follow independent semver,
tracked in their own `package.json` `version` fields (both start at
`0.1.0` as of Phase 6). Semver meaning, specific to this component:

- **MAJOR** — a breaking change to the Message Transport protocol
  (`MessageTransportRequest`/`MessageTransportResponse` shape) or to the
  meaning of an existing `sqlTemplateId` (e.g. changing what columns a
  template returns). A backend built against an older major version of the
  protocol cannot safely talk to a newer Connector, or vice versa.
- **MINOR** — a new `sqlTemplateId` added to the allow-list, a new
  optional field on the protocol types, or a new `IMessageTransport`
  implementation (e.g. a future WebSocket transport). Backward compatible:
  an older backend simply doesn't know about the new template/field yet.
- **PATCH** — internal fixes with no protocol or template-set change
  (e.g. a circuit-breaker timing fix inherited from `@hdsp/oracle-client`).

## Compatibility matrix

| Connector version | Protocol version | Compatible backend (`hdsp-backend` image tag) | Status |
|---|---|---|---|
| 0.1.x | 1 | 1.0.x | Current — Phase 7 `CloudOracleTransport` relay (one conformance template: `SELECT 1 FROM dual`), Phase 9 `REDIS_TLS` support, Phase 10 pairing-key generated-but-not-yet-consumed (see below) |

Mirrored in `COMPATIBILITY.json`'s `matrix` array — that file is what
`check-compatibility.js` actually reads; this table is kept for human
readability and must be updated in lockstep with it. Update both on every
Connector MAJOR/MINOR release, and on every `hdsp-backend` MAJOR release —
a Connector release without a corresponding row in both places should be
treated as not yet safe to deploy against any backend.

**Important scope note carried over from Phase 10:** "compatible" in this
table means *the Message Transport request/response shape matches* — it
does NOT mean the Connector pairing-key credential (Task 10.4) is verified
at connect time. That credential is generated and hashed by the backend
today but nothing in `connector/src/protocol/message-transport.interface.ts`
consumes it yet (tracked in `PHASE_10_DEFERRED_BACKLOG.md` under "Connector
fleet management"). A Connector in this table's compatible range will
successfully exchange requests with a matching backend purely via Redis
connection-level auth (Phase 9's `REDIS_TLS`), with no additional
application-level pairing check.

## SQL template allow-list is part of the compatibility surface

Every `sqlTemplateId` registered via `SqlTemplateRegistry.register()` in a
given Connector release is itself a versioned contract: a backend that
sends a request for `sqlTemplateId` X assumes X's `kind` (`query` vs
`execute`) and response shape are stable for that Connector's minor
version line. Removing or reshaping a template is a MAJOR change; adding
one is MINOR.

## Compatibility check at connect time

**Advertising (done, Phase 12 Task 12.5):** `health.ts`'s health-check
response now includes `connectorVersion` (from `package.json`) and
`protocolVersion` alongside the existing `oracle`/`connector` liveness
fields — additive, existing consumers reading only those two fields are
unaffected.

**Enforcement (partial, documented rather than overclaimed):**
`infrastructure/installer/check-compatibility.js` enforces compatibility
at *install/deploy time* for the self-hosted connector-relay variant
(`install.sh` runs it before pulling images) and the cloud release
manifest records the expected pairing (`build-images.yml`). Neither the
backend's `CloudOracleTransport` nor the Connector's own `start()` perform
a *runtime, connect-time* compatibility check against a live counterpart
today — a backend and Connector that are actually incompatible would still
fail on the first mismatched request rather than being refused up front by
either side. Closing that gap (a real connect-time handshake exchanging
`protocolVersion` before the first real request) is the natural next step
once there's operational pressure to justify it — tracked here rather than
left unmentioned.
