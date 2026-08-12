# Dynamic Per-Tenant HIS Query Architecture — Design Proposal

**Status:** Design approved; **D.1, D.2, D.3, D.4 implemented, D.5 core
rollout complete, D.6's production publication lifecycle implemented**
(2026-07-21/2026-07-22, see §11-17 below). D.5's explicitly-deferred call
sites (`ReferenceService.getEmployees()`/`.getUserContext()`,
`HisTokenBridgeService`, billing background-sync polling -- tracked
separately, see §16) and D.6's real-Oracle pilot itself (requires live
hospital infrastructure this sandbox doesn't have, see §15's runbook) are
not started. Per the same review discipline used for
`HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md`: this document is the architecture,
trade-offs, and security analysis for the design as a whole — no further
implementation beyond D.4 until each subsequent phase is individually
reviewed and approved.

**Builds on:** `ADR_CONNECTOR_PROTOCOL.md` (registration/auth/transport/dispatch,
Phases A-C), `HDSP_CONNECTOR_CURRENT_STATE_AUDIT.md` §8 (identifies this exact
gap after Phase C).

## 1. The problem, precisely

`CloudOracleTransport`'s `knownTemplates` map (`backend/src/modules/his/cloud-oracle.transport.ts`)
allow-lists queries by **exact SQL text**: a caller's `sql` string must
byte-match a pre-registered template, which resolves to a `sqlTemplateId`
the Connector separately has registered with identical SQL. This works for
the two conformance queries proven in Phase C (`health-check-select-1`,
`patient-search`) because their SQL is fixed and identical for every tenant.

It does not work for real HIS business queries. Auditing the actual call
sites (`patient.service.ts`, `billing.service.ts`, and the same pattern
repeated in `visit.service.ts`/`reference.service.ts`/`his-token-bridge.service.ts`)
shows every one of them builds SQL from **`HisConfigService.getConfig(tenantId)`**
— now tenant-scoped since tonight's Phase 3 — in one of two ways:

- **Admin-entered raw override** (`cfg['sql.patient.search']`, etc.): a
  vendor-portal admin pastes a complete SQL string for their hospital's
  schema. Different text per tenant, by design.
- **Config-driven builder** (`buildConfigSearch()`,`buildPatientSelect()`,
  `buildBillSelect()`, etc.): table/column names come from `cfg['patient.table']`,
  `cfg['patient.col.mrn']`, and so on, interpolated into a SQL template.
  Different identifiers per tenant, by design.

Either way, the resulting SQL string is **tenant-specific and only known at
request time** — there is no single fixed string to put in `knownTemplates`.
Exact-string matching and per-tenant dynamic SQL are fundamentally
incompatible, and Phase C's own doc comments already flagged this rather
than quietly working around it (`cloud-oracle.transport.ts`'s "Dispatch
mode" section, `connector/src/index.ts`'s `patient-search` comment).

**The constraint that must not move:** the Connector must still never
execute a SQL string that arrived over the per-request `connector:request`
channel. That is Phase 6's original security boundary
(`connector/src/protocol/sql-template-registry.ts`'s doc comment) and
nothing in this proposal weakens it — every design considered below keeps
"only a `sqlTemplateId` (never raw SQL) crosses the wire per-request" intact.

## 2. What's actually being asked for

Not "let the Connector run arbitrary SQL." What's needed: a way for a
**stable, tenant-independent logical operation** (e.g. "look up a patient by
MRN") to resolve, per tenant, to that tenant's own specific SQL — with the
Connector still only ever receiving a `sqlTemplateId` per request, and the
actual SQL text reaching it through a channel with the same trust
properties Phase 6-C already established (tenant-scoped, connector-
authenticated).

## 3. Key design decision: `queryId` as a stable logical key, decoupled
   from SQL text

Introduce a **`queryId`** — a stable string every business service already
implicitly has (it's the `sql.<domain>.<operation>` config-key suffix each
service already reads, e.g. `patient.getByMrn`, `patient.search`,
`billing.getBillsByMrn`). This becomes the thing that crosses the
`IOracleTransport` boundary in cloud_relay mode, instead of trying to
reverse-match caller-supplied SQL text.

**Interface change (additive, backward-compatible):**

```ts
// oracle-transport.interface.ts
query<T>(sql: string, binds?: OracleBindParameters, opts?: { maxRows?: number; queryId?: string }): Promise<T[]>;
```

- `DirectOracleTransport` ignores `queryId` entirely — self-hosted and
  direct-mode cloud tenants are **byte-identical**, zero behavior change.
- `CloudOracleTransport`, only in `'websocket'` dispatch mode, **requires**
  `queryId` for any query not in the static `knownTemplates` conformance
  set. Missing `queryId` throws a clear, actionable error (not a confusing
  `UnregisteredCloudQueryError` about SQL text that was never the real
  problem) — this makes the migration path per business service visible
  and intentional rather than silent.
- Business services adopt `queryId` one at a time (see §9 phasing) — this
  is precisely why it's a new optional field, not a breaking signature
  change.

Why not keep trying to match SQL text (e.g. normalize away tenant-specific
identifiers with a regex)? Because the config-driven builders interpolate
identifiers in arbitrary positions and the raw-override case is genuinely
free-text — there is no reliable way to recover "which logical operation is
this" from the SQL string alone without a parser, and even then, two
different tenants' raw overrides for the same logical operation could
legitimately look nothing alike. `queryId` sidesteps the whole problem by
having the caller state its intent directly, which it already knows (it's
the config key it just read).

## 4. Where tenant-specific SQL actually gets produced: reuse, don't duplicate

The dangerous version of this design duplicates each business service's
SQL-building logic into a second, cloud-side "compiler" — two
implementations of "build the patient search query," guaranteed to drift.

**Decision: extract the existing per-service SQL-building logic into
shared, exported functions** (e.g. `his-query-templates/patient.templates.ts`,
alongside the existing `his-config.helpers.ts`), callable from two places:

1. The business service itself, exactly as today — this is a pure refactor
   of `patient.service.ts`'s `buildPatientSelect()`/`buildConfigSearch()`
   (and their siblings in billing/visit/reference) out of the class body
   and into a shared function taking `(cfg: Record<string,string>)`. Direct
   mode's behavior does not change by one character.
2. A new **`HisQueryTemplateCompiler`** (cloud-side), which calls the same
   shared function against a given tenant's `HisConfigService.getConfig(tenantId)`
   to produce that tenant's concrete SQL for a given `queryId` — used only
   when preparing what to sync to a Connector (§5), never on the live
   request path.

This is the single most important correctness decision in this proposal:
**one source of truth for "what SQL does this operation compile to," reused
by both the direct-execution path and the relay-sync path.**

## 5. Delivery to the Connector: sync, not per-request

Compiled templates reach the Connector through the **same authenticated,
tenant-scoped WebSocket channel** already used for job dispatch — a new
message type, `connector:sync-templates`, distinct from
`connector:request`/`connector:response`. Reusing the "SYNC_METADATA" job
concept the original architecture doc's job model already anticipated
(`HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md`), not a new mechanism.

**Trigger points:**
- On connector (re)connection (`ConnectorGateway.handleConnection()`) — a
  full resync, so a Connector that was offline during a schema-config
  change catches up immediately rather than serving stale templates
  indefinitely.
- On `HisConfigService.invalidateCache(tenantId)` — already an existing,
  tenant-scoped hook (Phase 3 tonight) fired whenever that tenant's HIS
  config changes; extending it to also push a fresh compiled template set
  is a natural addition, not a new event source.

**Payload shape** (per sync): an array of
`{ queryId, sqlTemplateId, kind, sql, expectedBinds, definitionVersion }`
— see §6 for what `definitionVersion` actually is and why it's not just a
counter — where `sqlTemplateId` can simply be `queryId` itself — **a
Connector process serves exactly one tenant** (`ConnectorGateway`'s own doc
comment: "today always ≤1 in practice," one `ConnectorInstance` per
tenant), so there is no need to namespace templates by tenant on the
connector side at all.

**Connector-side change:** `SqlTemplateRegistry.register()` currently
throws on a duplicate id (`connector/src/protocol/sql-template-registry.ts`).
Add a `registerOrReplace()` for template sync (register semantics stay
throw-on-duplicate for the build-time-registered conformance templates in
`index.ts`, which should never legitimately collide) — live templates can
be swapped in without restarting the Connector process.

**Cloud-side lookup:** `CloudOracleTransport`, in relay mode, resolves
`(tenantId, queryId) -> sqlTemplateId` via a small per-tenant cache
populated at the same time templates are compiled — not the exact-string
`knownTemplates` map, which remains only for the fixed conformance queries.

## 6. Query definition versioning

Every compiled template needs a way for cloud and Connector to agree,
without guessing, on whether they're looking at the same definition. Three
related but distinct fields, not one:

- **`checksum`** — a content hash (SHA-256, truncated is fine) of the
  compiled `sql` string plus `expectedBinds`. This is the actual identity
  of a definition: two compiles of the same `(tenantId, queryId)` against
  unchanged `HisSchemaConfig` produce the same checksum, deterministically,
  with no dependency on wall-clock time or process state. This is what
  the Connector should compare to decide "do I already have this exact
  definition" — not a counter, which can't distinguish "genuinely new
  content" from "recompiled to the same content because nothing actually
  changed" (recompilation happening on every `invalidateCache()` call
  regardless of whether the specific fields a given `queryId` reads
  actually changed).
- **`definitionVersion`** — a monotonically increasing integer, scoped per
  `(tenantId, queryId)`, incremented only when `checksum` actually changes.
  This is what makes "the Connector is 3 versions behind" a meaningful,
  loggable statement, and what a future fleet-visibility view (explicitly
  deferred, per `ADR_CONNECTOR_PROTOCOL.md` §8) would surface — not
  needed for correctness of dispatch itself (the Connector only ever runs
  what it has, correctness comes from checksum matching, not counting),
  but needed for humans debugging "why is this hospital still on the old
  query."
- **`compiledAt`** — a timestamp, purely informational (support/debugging
  context: "this definition was compiled 40 minutes ago after a
  `HisSchemaConfig` save"), never used for comparison or ordering
  decisions — clock skew between cloud and a hospital's on-prem machine
  makes wall-clock time unsuitable as a source of truth for anything the
  protocol actually depends on.

**Where these live:** persisted cloud-side against the tenant (a new
`definitionVersion`/`checksum` column pair per `(tenantId, queryId)`, most
naturally colocated with `HisSchemaConfig` itself since that's what
invalidates it), and included in every `connector:sync-templates` payload
entry so the Connector's local `SqlTemplateRegistry` can log a definition
transition (`registerOrReplace()` logging old checksum -> new checksum) —
useful operational signal, not a blocking check: the Connector always
applies whatever it's sent, it doesn't negotiate or reject based on
version (that would just be a second, weaker copy of the trust argument
made below in §8 — the sync channel is already authenticated and
tenant-scoped, an incoming sync is trusted by construction, not
conditionally trusted based on comparing versions).

**What versioning is explicitly NOT for:** it is not a security boundary.
A Connector cannot use `definitionVersion` to decide whether to trust a
definition — trust comes entirely from the channel (§8 below), not from the
version number, which is compile-side metadata forgeable by anyone who
could already forge the channel (i.e., not a realistic threat this needs
to defend against). Versioning exists purely for staleness *observability*
and deterministic dedup ("did anything actually change"), not
authorization.

## 7. Definition lifecycle — when compilation and republish happen

Explicit trigger inventory, since "regenerate when something changes" is
too vague to implement or audit against:

| Trigger | What happens | Why |
|---|---|---|
| `HisSchemaConfig` saved/updated for a tenant (Vendor Portal, via the existing webhook/save path into `HisConfigService`) | Recompile every `queryId` for that tenant; for each whose `checksum` changed, bump `definitionVersion` and push via `connector:sync-templates` if that tenant's Connector is currently connected | The direct cause of any real SQL change — this is the dominant, expected trigger |
| Connector registers for the first time (`ConnectorRegistrationService.register()`, `ADR_CONNECTOR_PROTOCOL.md` §2) | Full compile + full sync, immediately after the WS connection is established (not during HTTP registration itself, which has no live socket yet) | A freshly-paired Connector starts with zero local templates; it needs its first full set before it can serve anything beyond the two build-time conformance queries |
| Connector reconnects (`ConnectorGateway.handleConnection()`, any subsequent connection for an already-registered instance) | Full resync (send every current definition, not a diff) | Simplest correct behavior for a Connector that may have been offline for an unknown duration — computing a diff against unknown prior local state is unnecessary complexity for what's already a small payload (the per-tenant query set is bounded, not unbounded) |
| Manual republish (an explicit admin/support action — e.g. "this tenant's Connector looks stuck on an old definition, force a resync") | Same full-compile-and-push as reconnection, triggered on demand rather than by an event | Operational escape hatch for whatever the automatic triggers above didn't handle correctly (a missed webhook, a bug) — not a substitute for fixing why the automatic path was missed, but necessary so a stuck tenant isn't blocked on a code deploy to fix |
| Platform upgrade (a backend deploy that changes shared template-builder logic itself, e.g. a D.1 template function's SQL shape changes) | Full recompile + resync for every tenant with an active Connector, triggered as a startup/migration step, not per-tenant lazily | Unlike the row above, this changes the compiler's output for a `HisSchemaConfig` that itself didn't change — checksums will legitimately differ for everyone at once; needs to be a deliberate, observable rollout step (loggable, ideally staged) rather than "whichever tenant happens to save their config next silently gets the new logic" |

**Explicitly not a trigger:** a plain read (`HisConfigService.getConfig()`
outside of a save) never recompiles or republishes anything — compilation
is write-path-driven only, keeping the read path (already proven
performance-sensitive — `getConfig()` is Redis-cached per tenant, Phase 3
tonight) completely unaffected by this proposal.

## 8. Security analysis

**Invariant restated:** the Connector only ever executes SQL that arrived
through the tenant-scoped, connector-authenticated sync channel — never SQL
carried on a per-request payload. This is unchanged from Phase 6.

**What trust is actually being extended, and why it's not new:**

- For the **config-driven builder** case, the only new inputs are table/
  column identifiers, already admin-configured in `HisSchemaConfig` today
  and already interpolated into SQL executed directly against that
  tenant's Oracle DB in direct mode. Relay mode doesn't trust anything
  beyond what direct mode already trusts — it just moves *where* that SQL
  executes. Defense-in-depth addition: validate identifier format
  (`^[A-Za-z_][A-Za-z0-9_$#]{0,29}$`, matching Oracle's own identifier
  rules) at `HisConfigService` **write time**, rejecting a malformed value
  before it can reach either direct execution or template compilation —
  cheap, and protective for direct mode too, not just relay mode.
- For the **admin raw-SQL override** case, the text is already fully
  trusted and executed unmodified in direct mode today. Nothing about
  relay mode increases this exposure — the same tenant admin who could
  already point their own hospital's `sql.patient.search` at anything they
  wanted can do so today, regardless of transport. The security question
  relay mode actually introduces is **provenance and isolation**, not
  content trust:
  - **Provenance**: does the SQL a Connector receives really come from
    *that tenant's own* `HisConfigService` entry? Yes — the compiler reads
    `HisConfigService.getConfig(tenantId)` for the specific tenant the sync
    is being prepared for; there is no path for one tenant's compiled
    templates to be attributed to another.
  - **Isolation**: can tenant A's templates ever reach tenant B's
    Connector? No — `connector:sync-templates` is delivered exactly like
    `connector:request` today, through `ConnectorGateway`'s
    `connector:{id}` room, resolved via the same `ConnectorDirectoryService`
    tenant->connector lookup already proven correct in Phase C's e2e test.
    Cross-tenant leakage is prevented structurally by the same mechanism
    that already prevents cross-tenant query dispatch — not a new check
    that could be forgotten.
- **Sanity guard on the sync payload itself**: `registerOrReplace()`
  rejects an incoming template whose `sql` is empty or doesn't start with
  `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`MERGE` — a cheap guard against a
  malformed sync message, not a substitute for the provenance/isolation
  argument above (which is what actually matters).

## 9. Phasing (proposal — not started)

1. **D.1 — Extract shared template builders.** Pure refactor: move each
   business service's inline SQL-building logic (`buildPatientSelect()`,
   `buildConfigSearch()`, `buildBillSelect()`, and siblings) into shared,
   exported functions. Zero behavior change for direct mode; this phase
   alone is safely shippable independent of everything below it.
2. **D.2 — `HisQueryTemplateCompiler` + per-tenant template cache
   (cloud-side only).** Uses D.1's shared functions against
   `HisConfigService.getConfig(tenantId)`. No Connector-facing change yet
   — this phase is unit-testable in isolation (given a `HisSchemaConfig`
   fixture, does the compiler produce the same SQL the business service
   would build itself?).
3. **D.3 — Sync channel.** `SqlTemplateRegistry.registerOrReplace()`,
   `connector:sync-templates` message on `ConnectorGateway`, wired to
   (re)connection and `HisConfigService.invalidateCache()`. Testable the
   same way Phase C's e2e test was built (real gateway, real
   `WebSocketMessageTransport`, mocked `OracleClient`) — assert a synced
   template is actually resolvable by a subsequent dispatch.
4. **D.4 — First `queryId` migration.** Extend `IOracleTransport` with
   optional `queryId`; migrate `PatientService.getByMrn()` (smallest
   surface, and the operation already proven end-to-end through the
   conformance-query path in Phase C) to pass `queryId: 'patient.getByMrn'`.
   Validate against a real Connector + mocked Oracle, mirroring Phase C's
   `cloud-oracle-transport-websocket-e2e.spec.ts` structure.
5. **D.6 — Real-Oracle pilot.** *(Reordered ahead of D.5, 2026-07-22 — see
   note below.)* Take the one operation already migrated
   (`patient.getByMrn`) and validate the full `queryId` path against a
   real Oracle/HIS deployment: real `HisSchemaConfig`, a real deployed
   Connector, real Oracle connectivity — not the mocked `OracleClient`
   every e2e test in this repository has used so far.
6. **D.5 — Remaining business services.** Roll `queryId` out to
   `PatientService.search()`, `BillingService`, `VisitService`,
   `ReferenceService`, `HisTokenBridgeService` incrementally, each
   independently shippable and testable.

**Reordering note (2026-07-22):** originally D.5 was planned before D.6.
Reversed on explicit direction: validating one already-migrated operation
against a real environment first surfaces whatever a mocked `OracleClient`
can't (Oracle identifier quirks, bind-parameter edge cases, real connector
process behavior, schema assumptions baked into `HisSchemaConfig`) while
only one business service needs adjusting if something unexpected turns
up — rather than discovering the same class of problem after five
services have already been migrated on the same unvalidated assumptions.
Once D.6 confirms the model holds under real conditions, D.5 becomes
comparatively mechanical, repeated per remaining service.

Each phase is independently revertible and self-hosted/direct-mode is
provably unaffected at every step (D.1 and D.2 touch no request path at
all; D.3 only adds a new message type nothing yet sends; D.4/D.5 only
change behavior for a tenant that has both `ORACLE_TRANSPORT=cloud_relay`
and `CLOUD_ORACLE_TRANSPORT_MODE=websocket` set, which is not the default
for anyone today).

## 10. Explicitly out of scope for this proposal

- Heartbeat, fleet management, packaging/installer, auto-update — per the
  user's own stated priority, these remain deliberately deferred until the
  execution path (now including real query coverage, once this proposal is
  implemented) is proven, not built in parallel with it.
- Making `CLOUD_ORACLE_TRANSPORT_MODE=redis` support `queryId` — the
  Redis path is explicitly the legacy/dev-only transport per
  `ADR_CONNECTOR_PROTOCOL.md` §4; extending it isn't worth the effort
  given WebSocket is the stated production direction.
- Changing anything about how `HisSchemaConfig` itself is edited/stored in
  Vendor Portal — this proposal only adds a compiler that *reads* it.

## 11. Implementation record — D.1 (2026-07-21)

D.1 (pure refactor, zero behavior change) is complete. New directory
`backend/src/modules/his/config/query-templates/`, one file per business
service, each exporting the exact SQL-building logic that previously lived
as a private method or inline closure inside that service:

| Service | Extracted function(s) | New file |
|---|---|---|
| `PatientService` | `buildPatientSelect(cfg)`, `buildPatientSearchSql(cfg)` | `patient.templates.ts` |
| `BillingService` | `buildBillSelect(cfg)` | `billing.templates.ts` |
| `VisitService` | `buildVisitsByMrnSql(cfg, opts)` | `visit.templates.ts` |
| `ReferenceService` | `buildDepartmentsSql(cfg, activeOnly)`, `buildDoctorsSql(cfg, deptCode?)` | `reference.templates.ts` |

Each function is a mechanical extraction — same code, same variable names,
same SQL text, only the binding changed from `this.method(cfg)`/a closure
over an outer `cfg` to an explicit `(cfg, ...)` function parameter. No SQL
string, join logic, or column-resolution call changed. Each business
service's call sites were updated to call the imported function instead of
the removed private method/closure; the private methods and the inline
`buildConfigSearch` closure in `PatientService.search()` were deleted
after their logic moved out, not left behind as dead code.

**Deliberately excluded from D.1** (per §1's own distinction):
`ReferenceService.getEmployees()`/`.getUserContext()` use a fixed,
hardcoded schema (`EMPLOYEE`, `HISUSER` table names, not
`<domain>.table`/`<domain>.col.*` config keys) — they don't fit this
proposal's "compiled per-tenant identifier substitution" pattern, so
extracting them here would misrepresent them as part of the dynamic-query
problem this design solves. Noted in `reference.templates.ts`'s own doc
comment so a future reader isn't left wondering why they're missing.

**Verification:** `backend`'s full-project `tsc --noEmit` completed clean
(exit 0) — the first time in this session a full backend typecheck
finished within the sandbox's command timeout, confirming no type errors
were introduced across any of the four refactored services or their call
sites. Running the actual Jest suite (`reference.service.spec.ts` in
particular, the one pre-existing test file covering a refactored service)
continued to hit this sandbox's established jest-execution timeout —
same limitation documented since Phase A, not something new in this pass.
Correctness for this phase rests on: the mechanical nature of the
extraction (verified by direct before/after comparison while writing it,
not just "should be fine"), the clean typecheck, and that every touched
service's public method signatures and behavior are unchanged. **Recommend
running `npm test` in `backend/` locally** — specifically
`reference.service.spec.ts`, and manually exercising `PatientService`/
`BillingService`/`VisitService` against a real or mocked Oracle instance —
before merging, since none of the four refactored services currently have
call-site-level test coverage beyond `reference.service.spec.ts` in this
repository.

## 12. Implementation record — D.2 (2026-07-21)

`HisQueryTemplateCompiler` (`backend/src/modules/his/config/his-query-template-compiler.service.ts`)
is complete, registered in `HisConfigModule` (depends only on
`HisConfigService`, already that module's own provider). Public surface is
exactly the single method requested:

```ts
compile(tenantId: string, queryId: string, parameters?: Record<string, unknown>): Promise<CompiledQueryDefinition>
```

**On not becoming a service locator:** callers get `compile()` and
`listQueryIds()` and nothing else. The four `query-templates/*.ts` files
from D.1 are imported only inside this class's file and referenced only
from a `private readonly registry` map keyed by `queryId` — nothing about
`patient.templates.ts`/`billing.templates.ts`/`visit.templates.ts`/
`reference.templates.ts` is part of this class's exported surface, and a
future caller (D.3's Publisher, D.4's `CloudOracleTransport`) needs to know
only a `queryId` string, never which file or function produces its SQL.

**Registered queryIds** (six, one or two per D.1 file):
`patient.getByMrn`, `patient.search`, `billing.getBillsByMrn`,
`visit.getByMrn`, `reference.departments`, `reference.doctors`. Each entry
checks the tenant's raw SQL override (`cfg['sql.<domain>.<operation>']`)
first, falling back to the D.1-extracted builder — the identical priority
order every business service's own request-time code already uses.

**`CompiledQueryDefinition`** carries `queryId`, `kind`, `sql`,
`expectedBinds`, `checksum` (SHA-256 of `sql` + bind names, truncated to 16
hex chars — the definition's real identity per §6), and `compiledAt`
(informational timestamp). **`definitionVersion` is deliberately absent**
from this type: per §6, it's only meaningful against persisted prior
state ("did the checksum change since last time"), and this compiler is a
pure function with nothing to compare against — that comparison, and the
counter it produces, belongs to the Publisher (D.3), not the compiler.

**Two errors, both actionable:** `UnknownQueryIdError` for an
unregistered `queryId`, and a new `IncompleteSchemaConfigError` — a
narrow, compiler-specific safety net that catches a missing
`HisSchemaConfig` key by checking the compiled SQL for the literal text
`"undefined"` before returning it, rather than letting it surface later as
an unexplained `ORA-00904` from Oracle. This is explicitly NOT the
identifier-format validation §6 describes as a future `HisConfigService`
write-time defense — that remains separate, not-yet-built work; this is
only "was the value present at all."

**Disclosed limitation carried forward, not hidden:** `patient.search`'s
raw-override branch is compiled as-is. `PatientService.search()`'s own
request-time code additionally rewrites `:lim`/`:like` placeholders
because Oracle rejects a bind variable in `FETCH FIRST :lim ROWS ONLY`
position — a per-request literal substitution that cannot be reduced to
one static compiled SQL string. A tenant whose raw override uses that
exact clause shape will fail at execution time via this compiled path.
Documented in the class's own doc comment as an open, disclosed gap
(neither introduced nor solvable by this phase), not worked around by
guesswork.

**Verification:** full backend `tsc --noEmit` completed clean (exit 0) —
second consecutive phase this session where the full project typechecked
within the sandbox's timeout. The new
`his-query-template-compiler.service.spec.ts` (nine cases: registered-id
listing, all six queryIds compile without error, unknown-id rejection,
missing-config-key rejection, checksum stability across repeated calls,
checksum sensitivity to actual config differences, raw-override
precedence, and shape-vs-value parameter handling) hit the same
jest-execution timeout as every other test this session — reviewed by
hand against the compiler's actual branching instead. **Recommend running
`npm test` locally**, in particular the checksum-stability and
raw-override-precedence cases, before relying on this compiler's output
for anything beyond local development.

## 13. Implementation record — D.3 (2026-07-22)

The Publisher layer is complete: persistence, `definitionVersion`
bookkeeping, the sync channel (both directions), and both of §7's
automatable triggers (schema save, connector reconnection).

**Persistence** — `HisQueryDefinition` entity + migration
(`his_query_definitions`, unique on `(tenant_id, query_id)`): stores the
last-known `sql`/`kind`/`expectedBinds`/`checksum`/`definitionVersion`/
`compiledAt` per tenant+queryId. This is the state `HisQueryTemplateCompiler`
(D.2) explicitly has none of — D.2's own doc comment said
`definitionVersion` "belongs to the Publisher," and this is that.

**`HisQueryDefinitionPublisherService`** — two public methods,
`publishChanged(tenantId)` and `publishFull(tenantId, connectorId?)`, both
delegating to one private `publish()`: compile every `queryId` (via
`compiler.listQueryIds()`), compare each fresh checksum against the
persisted row, bump `definitionVersion` only when they differ (exactly
§6's rule — recompiling to the *same* SQL never bumps the counter), and
push either only the changed ones (`publishChanged`) or the full current
set regardless of what changed this call (`publishFull`) — matching §7's
distinction between the schema-save trigger (send what changed) and the
reconnection trigger (send everything, since the Connector may have missed
changes while offline). A tenant missing a given queryId's config entirely
makes `compile()` throw `IncompleteSchemaConfigError` (D.2) — caught
per-queryId here and recorded in `skippedQueryIds` rather than failing the
whole publish; a tenant is not required to have every queryId configured
before any of them can be used.

**Trigger wiring, §7's table mapped to real code:**
- *HisSchemaConfig saved* → `LicenseController`'s `HIS_CONFIG_UPDATE`
  handler now captures `HisConfigService.applyWebhookUpdate()`'s return
  value (that method's signature changed from `Promise<void>` to
  `Promise<string | null>` — the resolved tenant it actually wrote to,
  source-compatible with every pre-existing caller that ignores the
  return) and calls `publishChanged(resolvedTenantId)` — fire-and-forget,
  logged on failure, never rethrown (a template-publish failure must never
  turn a successful config write into a failed webhook response).
- *Connector registers/reconnects* → `ConnectorGateway` gained a plain
  `EventEmitter` (`events`, not `@nestjs/event-emitter`'s `EventEmitter2`
  — a single gateway-local event with one intended subscriber didn't
  justify a new module-wide dependency) emitting `'connected'` after
  successful auth; `HisQueryDefinitionPublisherService.onModuleInit()`
  subscribes and calls `publishFull()`. Deliberately NOT a direct DI
  dependency in either direction — `HisConfigModule` already imports
  `ConnectorModule` (for `CloudOracleTransport`, Phase C), so
  `ConnectorGateway` depending back on anything in `HisConfigModule` would
  invert that; the event keeps the coupling one-directional and implicit
  rather than circular.
- *Manual republish* → `publishFull()` is exactly this trigger already;
  no separate method or endpoint needed, none built this pass.
- *Platform upgrade* → deliberately **not automated**. Per §7's own
  reasoning, recompiling every tenant on every backend boot would mask a
  compiler-logic-changing deploy as an ordinary restart; this remains a
  deliberate, observable operational step for whoever ships a D.1-template
  change, not a side effect of `onModuleInit()`.
- *Plain config read* → confirmed still untouched; `publish()` is only
  ever called from the two trigger points above, never from
  `HisConfigService.getConfig()`'s own read path.

**Sync channel, both sides:**
- Cloud: `ConnectorGateway.pushTemplateSync(connectorId, definitions)`
  emits `connector:sync-templates` to that connector's room — one-way, no
  response awaited or correlated (unlike `dispatchToConnector()`).
- Connector: `WebSocketMessageTransport.onTemplateSync()` listens on the
  SAME authenticated socket (not a second connection) and, in `index.ts`,
  applies each received definition via the new
  `SqlTemplateRegistry.registerOrReplace()` — kept deliberately separate
  from `register()` (which still throws on a duplicate id) so a real bug
  in the build-time conformance-template set still fails loudly rather
  than being silently swallowed by whichever registration method happened
  to run second.
- Shared shape: `SyncedTemplateDefinition` (`connector/src/protocol/sync-templates.interface.ts`,
  exported from `@hdsp/connector`) — a plain data type distinct from
  `SqlTemplateDefinition`, since `checksum`/`definitionVersion` are
  sync-protocol metadata, not part of what the registry needs to execute
  a request.

**Verification:** full `tsc --noEmit` clean for both `backend/` (exit 0 —
fourth consecutive clean full-project typecheck this session) and
`connector/`. `connector-template-sync-e2e.spec.ts` (new) proves the sync
channel end-to-end against a real `ConnectorGateway` and real
`WebSocketMessageTransport`: a `queryId` that was NEVER registered at
Connector build time fails with a structured, non-retryable error when
dispatched (confirming the test isn't trivially passing), then succeeds
immediately after `gateway.pushTemplateSync()` delivers it and the
connector applies it via `registerOrReplace()` — the same round trip
`HisQueryDefinitionPublisherService` drives in production, minus Bull and
DB persistence (same scope boundary Phase B's own e2e test already
established: durability/queueing is Bull's tested behavior, not this
codebase's to re-prove). Hit the same jest-execution timeout as every
other test this session when actually run — reviewed by hand instead,
same as every prior phase. **Recommend running `npm test` locally**
before treating the sync channel as verified beyond this review.

## 14. Implementation record — D.4 (2026-07-22)

The first real business-service `queryId` migration is complete:
`IOracleTransport`'s three execution methods now accept `queryId`, and
`PatientService.getByMrn()` — deliberately chosen as the smallest surface,
per §9's own phasing rationale, and the operation already proven reachable
through the conformance-query path in Phase C — has been switched over.

**`IOracleTransport` change** (`oracle-transport.interface.ts`):
`query()`'s `opts` gains `queryId?: string`; `queryOne()` gained an `opts`
parameter for the first time (`{ queryId?: string }`, it previously took
none); `execute()` gained the same. All additive — every existing call
site across `billing.service.ts`/`visit.service.ts`/`reference.service.ts`/
`his-token-bridge.service.ts` and elsewhere compiles unchanged since the
new parameter is optional everywhere.

**`DirectOracleTransport`** accepts and ignores `queryId` on all three
methods — self-hosted/direct mode has no allow-list to bypass, so it
always executes the literal `sql` string regardless of whether a caller
passes `queryId`. Zero behavior change confirmed by inspection: the only
new code is destructuring `queryId` out of `opts` and not using it.

**`CloudOracleTransport`** is where the actual dispatch-path change lives:

```ts
const sqlTemplateId = opts.queryId ?? this.resolveTemplate(sql).sqlTemplateId;
```

When `opts.queryId` is present, `resolveTemplate(sql)` — and therefore the
exact-string `knownTemplates` allow-list `UnregisteredCloudQueryError`
would otherwise come from — is **never consulted at all**. This is
deliberate, not a fallback path: the entire point of `queryId` (§3) is that
the caller states its logical intent directly rather than the transport
trying to reverse-match SQL text, so once a caller opts in, the SQL string
it happened to pass is not even inspected. `queryOne()` now passes its
`opts` through to `query()` (previously `(await this.query<T>(sql,
binds))[0] ?? null` with no opts parameter to forward). The Connector-side
`SqlTemplateRegistry` lookup — not anything client-side — remains the real
authorization boundary, exactly as §8's security analysis already argued
for the sync channel generally.

**Deliberately not special-cased:** a caller passing `queryId` while
`CLOUD_ORACLE_TRANSPORT_MODE=redis` is not given any fallback to the old
SQL-text path. It dispatches `queryId` as the `sqlTemplateId` exactly the
same way, and fails cleanly with a structured `UnknownSqlTemplateError`-
shaped response if the Connector's Redis-mode static registry (built at
`connector/src/index.ts` startup) doesn't happen to include that id —
which it won't, since queryId-namespaced definitions only ever arrive via
the D.3 websocket sync channel. This is an accepted, honest consequence of
`ADR_CONNECTOR_PROTOCOL.md` §4's own stance that Redis is legacy/dev-only
and is not being extended alongside this work — not a gap this phase
silently papers over.

**`PatientService.getByMrn()`** — both branches (raw-override and
config-driven) now pass a third argument, `{ queryId: 'patient.getByMrn'
}`, to `this.oracle.queryOne()`. The same `queryId` regardless of which
branch built the SQL: from the caller's perspective both perform the
identical logical operation, matching the `patient.getByMrn` entry already
registered in `HisQueryTemplateCompiler`'s registry (D.2) — no new
registry entry was needed, the compiler side of this pairing has existed
since D.2.

**Verification:** full backend `tsc --noEmit` did not complete within this
session's sandbox shell timeout on this pass (a stricter, hard-capped
timeout than earlier phases had available, not a sign of a new type
error) — reviewed the four changed files by hand instead: every new
parameter is optional and every changed signature is a strict superset of
its prior shape, so pre-existing call sites remain valid without needing a
graph-wide check to confirm it. New test:
`cloud-oracle-transport-queryid-e2e.spec.ts` mirrors Phase C's
`cloud-oracle-transport-websocket-e2e.spec.ts` structure exactly (real
`ConnectorGateway`, real `WebSocketMessageTransport`, mocked
`OracleClient`, `ConnectorJobDispatchService` stood in with the same
shape-compatible fake Phase C's test uses) and additionally reuses D.3's
sync-then-dispatch premise: the Connector-side registry starts empty of
`patient.getByMrn`, a dispatch with `opts.queryId` set fails before the
sync push (proving the Connector — not `CloudOracleTransport` — is the
actual gate), then succeeds once `gateway.pushTemplateSync()` delivers the
compiled definition, with the caller's own (deliberately wrong/
unregistered) `sql` argument never inspected. Hit the same
jest-execution timeout as every other test this session when actually
run — reviewed by hand instead, same as every prior phase. **Recommend
running `npm test` locally**, and separately confirming `tsc --noEmit`
clean outside this sandbox, before treating D.4 as verified beyond this
review.

## 15. D.6 pilot runbook (real-Oracle validation of `patient.getByMrn`)

D.6 requires a real deployed Connector against a real Oracle/HIS
instance — infrastructure this sandbox does not have access to. This
section is the concrete, actionable checklist for whoever runs it, so the
pilot is a mechanical execution of a plan rather than an ad hoc
investigation.

**Prerequisites:**
- A hospital environment with a deployed HDSP Connector, registered
  (`ADR_CONNECTOR_PROTOCOL.md` §2) and currently connected
  (`ConnectorGateway.isConnected(connectorId)` true).
- That tenant's `HisSchemaConfig` has either `sql.patient.getByMrn` (raw
  override) or `patient.table`/`patient.col.mrn` and its join-relevant keys
  (config-driven path) set correctly for that hospital's actual schema —
  whichever branch `buildPatientSelect()`/the raw-override check in
  `HisQueryTemplateCompiler`'s `patient.getByMrn` entry will take.
- Backend configured `ORACLE_TRANSPORT=cloud_relay`,
  `CLOUD_ORACLE_TRANSPORT_MODE=websocket` for this tenant (or globally, if
  this is the only tenant being piloted).

**Steps:**
1. Trigger a full publish for the tenant — either via the
   connector-reconnect trigger (restart the Connector) or via the D.6
   manual endpoint: `POST /license/his-query-definitions/:tenantId/republish`
   (or `POST /license/connector/:tenantId/resync`, if targeting a specific
   already-registered Connector), both `PLATFORM:SETTINGS:UPDATE`-gated.
   Confirm in logs (and in the `audit_logs` table, action
   `HIS_QUERY_DEFINITIONS_REPUBLISHED`/`CONNECTOR_RESYNC_TRIGGERED`) that
   `patient.getByMrn` was compiled and pushed
   (not skipped with `IncompleteSchemaConfigError` — if it was, the
   tenant's `HisSchemaConfig` is missing a key `buildPatientSelect()`
   needs; fix that before proceeding, not after).
2. Confirm connector-side application: the Connector's own logs (or a
   registry-inspection hook, if one exists) should show
   `registerOrReplace()` applied for `patient.getByMrn` with the checksum
   from step 1.
3. Call `PatientService.getByMrn(mrn)` for a real, known MRN in that
   hospital's Oracle instance (through the normal API route, ambient
   tenant context resolved as usual — no special test harness).
4. Verify: the returned `HisPatient` matches what a direct Oracle query
   for that MRN returns (cross-check against `ORACLE_TRANSPORT=direct` for
   the same tenant/MRN if that's available as an A/B comparison, or against
   a manual SQL*Plus/SQL Developer query otherwise).
5. Re-save `HisSchemaConfig` for the tenant (any no-op-equivalent edit) and
   confirm: `checksum` for `patient.getByMrn` is unchanged (proves
   recompilation doesn't spuriously bump `definitionVersion` when nothing
   that affects this query actually changed — §6's own claim, now checked
   against a real config record instead of a fixture).
6. Deliberately break something small and observe the failure mode is
   the expected one, not a silent wrong answer — e.g. temporarily point
   `patient.col.mrn` at a nonexistent column and confirm the request fails
   with a clear Oracle error (`ORA-00904`) surfaced up through
   `CloudOracleTransport`, rather than succeeding with garbage data. Revert
   afterward and re-publish.

**Success criteria:** step 3/4 return correct data end-to-end through the
full relay path; step 5 shows deterministic non-bumping recompilation;
step 6 fails loudly and correctly rather than silently. Any of these
failing means the design has a real gap this session's mocked-`OracleClient`
tests couldn't have caught — capture what specifically broke before
starting D.5, per the reordering rationale in §9.

**Rollback:** setting `ORACLE_TRANSPORT=direct` (or omitting `queryId`
from the call, which is not applicable here since `PatientService.getByMrn()`
now always passes it) fully reverts this tenant to direct-mode Oracle
access with no other code change needed — the same rollback property
every prior phase in this document already established.

## 16. D.5 progress: a real architectural gap found and fixed (2026-07-22)

D.5's own scoping pass (before wiring any additional call site) surfaced a
genuine incompatibility between two assumptions this design had been
carrying since D.2/D.3, never previously stress-tested against a queryId
whose SQL had runtime-option-driven shape:

- `HisQueryTemplateCompiler.compile(tenantId, queryId, parameters)` accepts
  a `parameters` argument specifically so a builder's SQL *shape* (not just
  bind values) can vary per compile call.
- `HisQueryDefinitionPublisherService.publish()` always calls
  `compiler.compile(tenantId, queryId)` with **no parameters** — it compiles
  and pushes exactly ONE static SQL definition per queryId, with no concept
  of "recompile this queryId once per distinct parameter combination a
  caller might use."

`visit.getByMrn` (`opts.visitType`), `reference.departments` (`activeOnly`),
and `reference.doctors` (`deptCode`) all had compile-time SQL-shape branches
depending on exactly the kind of parameter the Publisher never supplies.
Wiring these call sites as pure `queryId` passthroughs (the same mechanical
change that worked for `patient.getByMrn`/`patient.search`/
`billing.getBillsByMrn`/`billing.getBillById`/`billing.getLineItems`, all of
which are genuinely parameter-shape-free) would have meant: under
`ORACLE_TRANSPORT=cloud_relay`, a caller passing `visitType`/`activeOnly=false`/
`deptCode` would silently get whichever single variant was compiled at
publish time (unfiltered, in practice) — **not a loud failure, a wrong
answer.** Caught during scoping, before D.6's real-Oracle pilot could have
surfaced it as an unexplained data-correctness bug against a live hospital.

**Fix:** converted all three builders (`buildVisitsByMrnSql`,
`buildDepartmentsSql`, `buildDoctorsSql` in `config/query-templates/`) from
compile-time SQL-shape branching to always-present, bind-value-driven
predicates — the standard `:param IS NULL OR col = :param` pattern (and its
`:activeOnly = 0 OR ...` numeric-flag variant for the boolean case). Each
builder is now a pure function of `cfg` alone; `HisQueryTemplateCompiler`'s
corresponding registry entries no longer read `parameters` at all. This
restores the invariant the Publisher already assumed: **one `queryId` = one
canonical compiled SQL definition; runtime behavior varies only through
bind values, never through SQL text.** Direct-mode behavior is unchanged
(Oracle's own `IS NULL OR` short-circuit is logically equivalent to
omitting the clause) — verified in
`config/query-templates/__tests__/visit.templates.spec.ts` and
`reference.templates.spec.ts` via an old-vs-new filtering-logic equivalence
check across representative parameter values, and in
`his-query-template-compiler.service.spec.ts` via direct assertions that
compiling the same queryId with different `parameters` now yields identical
SQL/checksum (the inverse of what that spec asserted before this fix).

This is now a standing architectural rule for every future queryId: **no
compile-time parameter may change the SQL text.** Any new business-service
call site considered for `queryId` migration must be checked against this
rule during scoping, the same way this pass caught it for these three.

**Wired so far** (queryId passed at the call site, matching `patient.getByMrn`'s
established pattern): `patient.getByMrn` (D.4), `patient.search`,
`billing.getBillsByMrn`, `billing.getBillById`, `billing.getLineItems`
(both newly extracted per this section), `visit.getByMrn`,
`reference.departments`, `reference.doctors` — 8 operations total.

**Deliberately deferred, not yet wired** (see D.5's scoping notes for the
full reasoning): `ReferenceService.getEmployees()`/`.getUserContext()`
(fixed schema — `EMPLOYEE`/`HISUSER` — rather than this design's
`<domain>.table`/`<domain>.col.*` config-driven identifiers; whether a
fixed-schema query even belongs in this compiler pattern is an open
question, not a mechanical wiring decision); `HisTokenBridgeService`'s four
methods (no `HisConfigService`/tenant-config involvement at all today —
different service shape entirely); `BillingService.getNewFinalizedBills()`/
`.getChangedBills()` (background sync-poll semantics, not a per-request
user call — worth deciding separately whether background jobs should even
route through `queryId`/cloud-relay at all, given `CloudOracleTransport`'s
`'websocket'` dispatch mode currently requires an ambient HTTP-request
tenant context it doesn't have); `HisSyncService.diagnose()` (debug/ad hoc
introspection, not a stable named operation); `HisLoyaltyBridgeService`'s
two `execute()` calls (MERGE/DELETE writes, not SELECTs — different risk
profile, a separate decision).

## 17. D.6: production publication lifecycle (2026-07-22)

D.6 turns the query-definition pipeline from a development feature into an
operational subsystem — no temporary testing hooks, pilot-only endpoints,
or Swagger-only utilities, per this phase's explicit engineering
requirement.

**Automatic synchronization** (already existed from D.3, unchanged in
substance, made durable here): two triggers keep a tenant's Connector in
sync without any human action —
1. **Connector reconnect** — `ConnectorGateway`'s `'connected'` event
   (fired once a socket authenticates and joins its rooms) triggers a full
   republish, so a Connector that was offline for any reason (crash,
   network blip, redeploy) gets every current definition re-pushed the
   moment it comes back.
2. **`HIS_CONFIG_UPDATE` webhook** — `LicenseController`'s handler
   triggers a changed-only republish immediately after
   `HisConfigService.applyWebhookUpdate()` persists a tenant's new
   `HisSchemaConfig`, so a hospital's schema-mapping edit reaches its
   Connector without a manual step.

Both triggers now go through a new **durable Bull queue**
(`QUEUE_NAMES.HIS_QUERY_PUBLISH`, `HisQueryPublishProcessor`) instead of a
bare `.catch(err => logger.error(...))` fire-and-forget call — the
previous behavior meant a transient failure (a DB blip while persisting
`HisQueryDefinition`, Redis briefly unreachable) silently lost that
publish opportunity until the NEXT reconnect/webhook, with nothing
watching for it. `HisQueryDefinitionPublisherService.enqueuePublishFull()`/
`enqueuePublishChanged()` enqueue a job; `HisQueryPublishProcessor`
processes it by calling the same `publishFull()`/`publishChanged()`
methods that always existed, now with `bullAsyncOptions`' standard 3
attempts / exponential backoff retry policy. This is genuine **retry and
recovery behavior**, not cosmetic: `publish()` is a pure recompile-and-diff
against `HisQueryDefinition`, safe to re-run any number of times, so a
retried job is exactly as correct as the first attempt would have been.

**Permanent authenticated operational controls** — two new routes on the
existing `LicenseController` (chosen over a new one-off controller because
it already owns this exact call path and its `JwtAuthGuard` +
`PermissionsGuard` + `RequirePermissions('PLATFORM:SETTINGS:UPDATE')`
convention, matching every other platform-admin write route in that
file):

- `POST /license/his-query-definitions/:tenantId/republish` — recompiles
  and re-pushes every registered queryId for an explicit tenant. Calls
  `publishFull()` **directly** (not via the queue) so the admin who
  triggered it gets an immediate, honest HTTP response (the `PublishSummary`
  itself: which queryIds changed, which were skipped for missing config,
  whether the push actually reached a connected Connector) — a synchronous
  admin action watching the response doesn't need Bull's durability, it
  needs a real-time answer.
- `POST /license/connector/:tenantId/resync` — same underlying mechanism,
  distinct audit action and operator-facing intent ("this tenant's
  Connector looks stale/disconnected, force it"). Fails loudly with 404 if
  the tenant has never registered a Connector at all (a genuine setup
  problem), separate from "registered but currently offline" (succeeds
  with `pushed: false` — recoverable automatically once that Connector
  reconnects, since reconnection triggers its own full republish per the
  automatic-sync section above).

Both routes call `AuditService.log(...)` (the same `auditService.log({...})`
convention `LicenseService`/`RolesService`/`UsersService` already use —
**not** the `@Audit(...)` decorator seen elsewhere in this controller,
which was found during this pass to be dead code: `AuditInterceptor` is
never registered globally, so that decorator silently does nothing today)
with the actor's user id, the target tenant/connector id, and the full
`PublishSummary` as `newValue` — a complete, queryable record of who
triggered a republish/resync, when, and what it actually did.

**Known limitation, disclosed rather than worked around:** neither route
(nor `publishFull()` itself) purges a stale/decommissioned queryId from the
Connector's in-memory `SqlTemplateRegistry` — `registerOrReplace()` only
sets/overwrites entries by id; there is no `clear()`/delete primitive and
no corresponding Connector protocol message for one. A queryId that's
removed from `HisQueryTemplateCompiler`'s registry (or stops compiling for
a tenant, e.g. a config field was cleared, throwing
`IncompleteSchemaConfigError`) lingers in a Connector's registry until that
process restarts. "Resync" today means "guarantee every currently-valid
queryId is freshly re-pushed," not "guarantee a clean slate." A future
`connector:reset-templates` protocol message would close this gap; not
built in this pass since D.6's scope is the publication lifecycle for
currently-valid definitions, not registry garbage collection.

**Addendum (Task #102, "Vendor Portal Connector Management," 2026-07-22):**
these two `LicenseController` routes remain exactly as described above,
unchanged — they're the internal-HDSP-admin-JWT path. A second, parallel
pair now exists on `TenantProvisioningController`
(`POST platform/tenant-provisioning/tenants/:tenantId/connector/republish`
and `.../resync`), reachable via the additive SUPER_ADMIN-JWT-or-
Vendor-Portal-API-key guard that controller already uses. Both new routes
call the exact same `HisQueryDefinitionPublisherService.publishFull()` —
no publish logic is duplicated, only the thin controller/guard layer — so
a Vendor Portal support engineer can trigger a republish/resync without
ever being handed an internal HDSP admin JWT. See
`HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §16 for the full Vendor Portal
Connector Management surface this belongs to (status/health, activity
history, Activation Code generation, installer info).

**Complete connector lifecycle integration:** a newly-registered Connector
(`ConnectorRegistrationService.register()`) receives its first full
publish the moment its process actually dials in and authenticates (the
same `'connected'` event every subsequent reconnect uses) — there is no
separate "first sync after registration" step to wire, registration and
first-connection-triggered-publish are already the same code path.

**What D.6 deliberately does NOT include:** the real-Oracle pilot itself
(§15's runbook — requires live hospital infrastructure this sandbox
doesn't have) and the broader platform-validation/hardening items (Task
#47, full backend/Jest validation, BullMQ live-Redis validation, long-running
reconnect testing, multi-tenant verification, connector heartbeat/health,
fleet management, Windows Service packaging, installer, auto-update,
production monitoring) — all tracked as separate, later work, per this
phase's own instruction to keep each logical unit reviewable on its own.
