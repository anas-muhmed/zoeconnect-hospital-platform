import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  RedisMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from '@hdsp/connector';
import { IOracleTransport, OracleBindParameters } from '../platform/infrastructure/oracle/oracle-transport.interface';
import { HisUnavailableError } from '@hdsp/oracle-client';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { ConnectorJobDispatchService } from '../platform/connector/connector-job-dispatch.service';
import { ConnectorDirectoryService } from '../platform/connector/connector-directory.service';

/**
 * CloudOracleTransport (Phase 7 "Cloud Oracle Transport", Task 7.1).
 *
 * Implements `IOracleTransport` by routing every call through the Phase 6
 * Message Transport to a deployed Connector instance, instead of talking to
 * Oracle directly. Same public method signatures as `DirectOracleTransport`
 * (`isAvailable`/`query`/`queryOne`/`execute`/`reconfigure`) so Business
 * modules (HIS, Attendance, EIC, Token, Loyalty) never need to know which
 * implementation is active — the invariant carried over from every
 * Phase 3-6 provider swap.
 *
 * ── The one real architectural seam this transport has to bridge ──
 *
 * `IOracleTransport.query()`/`execute()` take an arbitrary raw SQL string
 * (matching how Business-layer services build their own SQL today) but the
 * Phase 6 Message Transport protocol deliberately only accepts a
 * pre-registered `sqlTemplateId` (the SQL-template allow-list -- see
 * `connector/src/protocol/sql-template-registry.ts`'s doc comment for why:
 * the Connector must never execute an arbitrary SQL string sent over the
 * wire). This is NOT a Phase 7 shortcut -- it is Phase 6's own deliberate
 * security boundary, and Phase 7 does not weaken it to make raw-SQL passthrough
 * "just work."
 *
 * The resolution: `CloudOracleTransport` holds a local, exact-string-match
 * registry (`knownTemplates`) mapping a normalized SQL string to the
 * `sqlTemplateId` the Connector has ALSO registered for that exact query.
 * A caller's `sql` argument that doesn't match a known, allow-listed
 * template throws `UnregisteredCloudQueryError` -- a clear, permanent,
 * non-retryable failure distinct from `HisUnavailableError` (which means
 * "Oracle/Connector is temporarily unreachable," not "this query was never
 * allow-listed"). This means: **`CloudOracleTransport` today only supports
 * the specific queries registered in `knownTemplates` below** -- proving
 * the transport-swap mechanism end-to-end, not yet covering every raw SQL
 * string every Business module happens to build. Expanding `knownTemplates`
 * to cover real production HIS queries is explicitly deferred (see
 * PHASE_7_IMPLEMENTATION_PLAN.md's follow-ups) -- Phase 6's own completion
 * notes already flagged "no real sqlTemplateIds are registered yet... once
 * CloudOracleTransport defines which queries it actually needs" as
 * Phase 7 work, and this is that work's starting point, not its finish.
 *
 * ── Error-semantics parity (Task 7.4 boundary, kept here since it's the
 * same mapping logic) ──
 *
 * A Message Transport response with `error.retryable: true` (Connector
 * reported Oracle/connector-level unavailability) is translated to a
 * thrown `HisUnavailableError` -- the exact same exception type
 * `OracleClient`/`OraclePoolService` throw for the equivalent condition, so
 * every existing `catch (err) { if (err instanceof HisUnavailableError) ...
 * }` call site in Business modules keeps working unchanged, regardless of
 * which transport is active.
 *
 * ── Dispatch mode (Phase C, "Oracle execution path" — 2026-07-21) ──
 *
 * `CLOUD_ORACLE_TRANSPORT_MODE` (default `'redis'`) selects HOW a resolved
 * `sqlTemplateId` reaches a Connector, independent of `ORACLE_TRANSPORT`
 * (which only selects whether this class is used at all). `'redis'` is
 * byte-identical to every prior behavior: one untenanted
 * `RedisMessageTransport` shared by every tenant. `'websocket'` resolves
 * the AMBIENT tenant (`TenantContextStorage`, same mechanism
 * `OraclePoolManager` already uses) to a registered `ConnectorInstance`
 * (`ConnectorDirectoryService`) and dispatches through
 * `ConnectorJobDispatchService` -> `ConnectorGateway` -> that specific
 * tenant's WebSocket connection instead. See `ADR_CONNECTOR_PROTOCOL.md`
 * §4 for the full rationale on why WebSocket is the long-term production
 * transport and Redis is being retained only for local/dev/CI use. The
 * two dependencies this needs (`ConnectorJobDispatchService`,
 * `ConnectorDirectoryService`) are `@Optional()` so this class remains
 * constructible (in `'redis'` mode, or in any test that doesn't need
 * them) without pulling in `ConnectorModule`'s full provider graph.
 */
export class UnregisteredCloudQueryError extends Error {
  constructor(sql: string) {
    super(`No Connector-allow-listed SQL template matches this query — CloudOracleTransport only supports queries registered in its knownTemplates map. Query: ${sql.slice(0, 120)}...`);
    this.name = 'UnregisteredCloudQueryError';
  }
}

/**
 * Thrown in `'websocket'` dispatch mode when there is no ambient tenant,
 * or that tenant has never registered a Connector. Deliberately a plain
 * `Error`, not `HisUnavailableError` -- this is not "temporarily
 * unreachable, retry shortly" (the circuit breaker's job), it's "this
 * tenant has no Connector to dispatch to at all," a configuration/setup
 * problem the circuit breaker's cooldown-and-retry semantics would only
 * obscure.
 */
export class ConnectorNotRegisteredError extends Error {
  constructor(reason: string) {
    super(`Cannot dispatch via websocket transport: ${reason}`);
    this.name = 'ConnectorNotRegisteredError';
  }
}

interface KnownTemplate {
  sqlTemplateId: string;
  kind: 'query' | 'execute';
}

@Injectable()
export class CloudOracleTransport implements IOracleTransport, OnModuleDestroy {
  private readonly logger = new Logger(CloudOracleTransport.name);
  private readonly transport: RedisMessageTransport;
  private readonly requestTimeoutMs: number;

  /** Normalized SQL string -> known Connector template. See class doc comment. */
  private readonly knownTemplates = new Map<string, KnownTemplate>();

  /**
   * Fail-fast circuit breaker (Task 7.4) — same cooldown-based design as
   * `OracleClient`'s (`packages/oracle-client/src/oracle-client.ts`), so
   * operational resilience characteristics don't regress when
   * `ORACLE_TRANSPORT=cloud_relay` is active. Tripped only by
   * transport-level failures (timeout, Redis unreachable) — never by an
   * `UnregisteredCloudQueryError`, exactly mirroring `OracleClient`'s own
   * distinction between "connection-acquire failure trips the breaker" vs.
   * "a bad query against a live connection does not."
   */
  private circuitOpenUntil = 0;
  private static readonly CIRCUIT_COOLDOWN_MS = 15_000;

  /** See this class's doc comment, "Dispatch mode" section. */
  private readonly dispatchMode: 'redis' | 'websocket';

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly tenantContext?: TenantContextStorage,
    @Optional() private readonly jobDispatch?: ConnectorJobDispatchService,
    @Optional() private readonly connectorDirectory?: ConnectorDirectoryService,
  ) {
    const redisUrl = this.config?.get<string>('CONNECTOR_REDIS_URL') ?? this.buildDefaultRedisUrl();
    this.requestTimeoutMs = this.config?.get<number>('CONNECTOR_REQUEST_TIMEOUT_MS', 30_000) ?? 30_000;
    this.transport = new RedisMessageTransport(redisUrl);
    this.dispatchMode = (this.config?.get<string>('CLOUD_ORACLE_TRANSPORT_MODE', 'redis') as 'redis' | 'websocket') ?? 'redis';

    // Conformance/pilot template set (Task 7.1's starting point — see class
    // doc comment). Both sides of this pairing (id + exact SQL) must exist
    // identically in the Connector's own SqlTemplateRegistry for a request
    // to succeed; registering it here alone does not make the Connector
    // accept it.
    this.registerKnownTemplate('SELECT 1 FROM dual', { sqlTemplateId: 'health-check-select-1', kind: 'query' });
    // Phase C (2026-07-21): second conformance query — parameterized,
    // row-returning. Must stay byte-identical to connector/src/index.ts's
    // 'patient-search' registration (same doc-comment caveat applies: this
    // is a representative generic query, NOT PatientService's real
    // per-tenant dynamic SQL — see that file's comment for why those two
    // can't share a template yet).
    this.registerKnownTemplate(
      'SELECT patient_id AS "mrn", first_name AS "firstName", last_name AS "lastName" FROM patients WHERE UPPER(first_name) LIKE :nameMatch FETCH FIRST 20 ROWS ONLY',
      { sqlTemplateId: 'patient-search', kind: 'query' },
    );
  }

  /**
   * Builds a `redis://` URL from the same REDIS_HOST/PORT/PASSWORD/DB env
   * vars every other Redis client in this backend uses (see redis.config.ts),
   * when CONNECTOR_REDIS_URL isn't explicitly set. Previously this omitted
   * the password entirely (`redis://host:port`) -- harmless while
   * ORACLE_TRANSPORT stayed at its 'direct' default (this transport is
   * never used then), but a real, silent break for any deployment that
   * actually set ORACLE_TRANSPORT=cloud_relay against a password-protected
   * Redis: RedisMessageTransport's pub/sub clients would have failed auth
   * exactly the same way this bug surfaced during local dev testing.
   */
  private buildDefaultRedisUrl(): string {
    // `this.config?.get(key, default)` -- when `this.config` itself is
    // undefined (no ConfigService injected, e.g. `new CloudOracleTransport()`
    // with no args, which every test constructing a bare instance does),
    // optional chaining short-circuits the ENTIRE call to `undefined`,
    // never reaching ConfigService's own default-value parameter. The
    // `?? 'localhost'`/`?? 6379`/`?? 0` fallbacks below are therefore
    // applied AFTER the optional-chained call, not passed as ConfigService's
    // own default arg -- previously this produced a URL containing the
    // literal string "undefined" for host/port whenever `config` was
    // absent, which ioredis's `parseURL` rejects with "Invalid URL". Fixed
    // 2026-07-22 after `npm test` surfaced it via
    // `oracle-transport.conformance.spec.ts` and
    // `cloud-oracle-transport-websocket-e2e.spec.ts`'s
    // no-args-constructible test.
    const host = this.config?.get<string>('REDIS_HOST') ?? 'localhost';
    const port = this.config?.get<number>('REDIS_PORT') ?? 6379;
    const password = this.config?.get<string>('REDIS_PASSWORD');
    const db = this.config?.get<number>('REDIS_DB') ?? 0;
    const auth = password ? `:${encodeURIComponent(password)}@` : '';
    return `redis://${auth}${host}:${port}/${db}`;
  }

  /** Registers a caller-side SQL-to-template mapping. Exposed (not private-only) so a future task can extend the set without touching this class's internals. */
  registerKnownTemplate(sql: string, template: KnownTemplate): void {
    this.knownTemplates.set(this.normalize(sql), template);
  }

  private normalize(sql: string): string {
    return sql.trim().replace(/\s+/g, ' ').replace(/;\s*$/, '');
  }

  private resolveTemplate(sql: string): KnownTemplate {
    const template = this.knownTemplates.get(this.normalize(sql));
    if (!template) {
      throw new UnregisteredCloudQueryError(sql);
    }
    return template;
  }

  get isAvailable(): boolean {
    // Reflects the local circuit-breaker state, not a live Connector
    // health check (no synchronous status is available without a network
    // round-trip) -- matches OracleClient's own "isAvailable is a fast,
    // local check" characteristic, not a live ping.
    return Date.now() >= this.circuitOpenUntil;
  }

  private assertCircuitClosed(): void {
    if (Date.now() < this.circuitOpenUntil) {
      throw new HisUnavailableError('Cloud Oracle transport is temporarily unavailable (recent Connector failure) — retrying shortly');
    }
  }

  private tripCircuit(reason: string): void {
    this.circuitOpenUntil = Date.now() + CloudOracleTransport.CIRCUIT_COOLDOWN_MS;
    this.logger.warn(`Opening circuit for ${CloudOracleTransport.CIRCUIT_COOLDOWN_MS}ms: ${reason}`);
  }

  private async sendRequest(sqlTemplateId: string, binds: OracleBindParameters): Promise<MessageTransportResponse> {
    this.assertCircuitClosed();

    const req: MessageTransportRequest = { correlationId: randomUUID(), sqlTemplateId, binds };
    try {
      const response = this.dispatchMode === 'websocket'
        ? await this.sendViaWebSocket(req)
        : await this.transport.send(req, this.requestTimeoutMs);
      this.circuitOpenUntil = 0; // a completed round-trip (success OR a well-formed error) means the transport itself is reachable
      return response;
    } catch (err) {
      // ConnectorNotRegisteredError is a setup/config problem, not a
      // transient transport failure -- surfacing it through the circuit
      // breaker (which assumes "retry shortly will probably work") would
      // be misleading, so it's rethrown as-is rather than trip+wrap.
      if (err instanceof ConnectorNotRegisteredError) throw err;

      // Otherwise: a transport-level failure (timeout, Redis unreachable,
      // ConnectorOfflineError, Bull retry exhaustion) -- never an
      // application-level error, which comes back as a normal
      // `{ok: false, error: {...}}` response instead.
      this.tripCircuit((err as Error).message);
      throw new HisUnavailableError(`Cloud Oracle transport request failed: ${(err as Error).message}`);
    }
  }

  /**
   * `'websocket'` dispatch path (see class doc comment). Resolves the
   * ambient tenant the same way `OraclePoolManager.resolveTenantKey()`
   * does (via `TenantContextStorage`), looks up that tenant's registered
   * `ConnectorInstance` via `ConnectorDirectoryService`, then dispatches
   * through `ConnectorJobDispatchService` -- which itself durably wraps
   * `ConnectorGateway.dispatchToConnector()` in a BullMQ job (retry/backoff
   * on a briefly-offline connector, per `bullAsyncOptions`).
   */
  private async sendViaWebSocket(req: MessageTransportRequest): Promise<MessageTransportResponse> {
    if (!this.jobDispatch || !this.connectorDirectory) {
      throw new ConnectorNotRegisteredError(
        'CLOUD_ORACLE_TRANSPORT_MODE=websocket but ConnectorJobDispatchService/ConnectorDirectoryService were not injected -- ' +
        'ensure HisConfigModule imports ConnectorModule.',
      );
    }

    const tenantId = await this.tenantContext?.currentTenantIdOrNull();
    if (!tenantId) {
      throw new ConnectorNotRegisteredError(
        'no ambient tenant context is available -- websocket dispatch requires a resolvable tenant (background jobs with no HTTP request context are not yet supported in this mode).',
      );
    }

    const connectorId = await this.connectorDirectory.findConnectorIdForTenant(tenantId);
    if (!connectorId) {
      throw new ConnectorNotRegisteredError(`tenant ${tenantId} has no registered Connector instance.`);
    }

    return this.jobDispatch.dispatch(tenantId, connectorId, req, this.requestTimeoutMs);
  }

  private throwForErrorResponse(response: Extract<MessageTransportResponse, { ok: false }>): never {
    if (response.error.retryable) {
      this.tripCircuit(response.error.message);
      throw new HisUnavailableError(response.error.message);
    }
    throw new Error(response.error.message);
  }

  /**
   * D.4 ("Dynamic Per-Tenant HIS Query Architecture"): when `opts.queryId`
   * is provided, it is used directly as the dispatched `sqlTemplateId`,
   * bypassing `resolveTemplate(sql)` (and its exact-string `knownTemplates`
   * allow-list) entirely -- `sql` itself is only used to build the request
   * when no `queryId` is given, i.e. for callers not yet migrated off raw
   * SQL text (the two static conformance templates registered in the
   * constructor). This is deliberate, not a fallback-if-fails: a caller
   * that DOES pass `queryId` gets no exact-string check at all, since the
   * whole point of `queryId` is to skip that check (the Connector-side
   * `SqlTemplateRegistry`/`sqlTemplateId` lookup is the real authorization
   * boundary here -- see `ADR_CONNECTOR_PROTOCOL.md` §4 and
   * `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §3).
   *
   * Note: in `'redis'` dispatch mode, a `queryId` that was only ever synced
   * to the Connector over the websocket sync-templates channel (D.3) will
   * simply fail with an `UnknownSqlTemplateError`-shaped response -- Redis
   * mode's statically-registered, build-time templates don't include
   * queryId-namespaced entries, and this is not being special-cased to
   * fall back, matching this transport's/the ADR's stance that Redis is
   * legacy/dev-only and not being extended alongside the dynamic-query work.
   */
  async query<T = Record<string, unknown>>(sql: string, binds: OracleBindParameters = {}, opts: { maxRows?: number; queryId?: string } = {}): Promise<T[]> {
    const sqlTemplateId = opts.queryId ?? this.resolveTemplate(sql).sqlTemplateId;
    const response = await this.sendRequest(sqlTemplateId, binds);
    if (!response.ok) this.throwForErrorResponse(response);
    return (response.rows ?? []) as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, binds: OracleBindParameters = {}, opts: { queryId?: string } = {}): Promise<T | null> {
    const rows = await this.query<T>(sql, binds, opts);
    return rows[0] ?? null;
  }

  async execute(sql: string, binds: OracleBindParameters = {}, opts: { queryId?: string } = {}): Promise<number> {
    const sqlTemplateId = opts.queryId ?? this.resolveTemplate(sql).sqlTemplateId;
    const response = await this.sendRequest(sqlTemplateId, binds);
    if (!response.ok) this.throwForErrorResponse(response);
    return response.rowsAffected ?? 0;
  }

  /**
   * Oracle credentials are managed by the deployed Connector instance, not
   * the backend, when `ORACLE_TRANSPORT=cloud_relay` — the backend never
   * holds direct DB credentials in this mode. This is the same conclusion
   * the pre-Phase-7 cross-repository impact analysis reached for Vendor
   * Portal's `testDbConnection()`/`oracle-test` flow: it assumes direct
   * connectivity and is correctly out of scope to fix until Phase 10 makes
   * cloud hospitals first-class citizens in Vendor Portal. Until then,
   * this method deliberately returns a clear, honest "not supported"
   * response rather than pretending to reconfigure a pool that doesn't
   * exist on this side of the Connector.
   */
  async reconfigure(_creds: Record<string, string>, _testOnly = false): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: 'reconfigure() is not supported when ORACLE_TRANSPORT=cloud_relay — Oracle credentials are managed by the Connector instance, not the backend. See PHASE_7_VENDOR_PORTAL_IMPACT_ANALYSIS.md.',
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.transport.stop();
  }
}
