/**
 * OracleClient — Phase 6 ("Connector") Task 6.1.
 *
 * Framework-agnostic extraction of the pool-creation/retry, circuit-breaker,
 * and query/execute/reconfigure logic that previously lived entirely inside
 * the backend's `OraclePoolService` (`backend/src/modules/his/oracle-pool.service.ts`).
 * This is a MECHANICAL relocation, not a rewrite -- every method body below
 * is the same logic, same defaults, same error types, same circuit-breaker
 * cooldown window. The only things removed are NestJS-specific concerns
 * that don't belong in a framework-agnostic shared package:
 *
 *   - `@Injectable()`/`OnModuleInit`/`OnModuleDestroy` decorators (the
 *     backend's `OraclePoolService` now calls `connect()`/`close()`
 *     explicitly from its own lifecycle hooks instead).
 *   - Reading config via `ConfigService.get('oracle')` (this class takes a
 *     plain `OracleClientConfig` object instead -- the backend wrapper is
 *     responsible for building that object from `ConfigService`).
 *   - The `HisConfigService`-driven "apply vendor-pushed credentials on
 *     startup" step and the Redis branch-cache-busting side effect in
 *     `reconfigure()` -- both are backend-specific orchestration concerns,
 *     not pool/circuit-breaker logic. `reconfigure()` here still returns
 *     the same `{ok, message}` shape and swaps the pool the same way; an
 *     optional `onReconfigured` callback lets a caller (like the backend
 *     wrapper) hook in side effects (e.g. clearing the branch cache)
 *     without this package needing to know Redis exists.
 *   - Logging via NestJS's `Logger` class -- replaced with a minimal
 *     `OracleClientLogger` interface (`log`/`warn`/`error`), defaulting to
 *     `console` when not provided, so this package has no NestJS
 *     dependency at all.
 *
 * Consumed by:
 *   - `backend/src/modules/his/oracle-pool.service.ts` (thin NestJS DI
 *     wrapper, Phase 6 Task 6.1's other half).
 *   - `connector/` (the new standalone package, Phase 6 Tasks 6.2-6.4),
 *     which uses this same class directly with no NestJS wrapper at all.
 */

// oracledb is loaded dynamically -- thick mode requires native libs at
// runtime, exactly as in the original OraclePoolService.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
let oracledb: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OraclePool = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OracleConnection = any;

export type OracleBindParameters = Record<string, unknown>;

export interface OracleClientLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const consoleLogger: OracleClientLogger = {
  log: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

export interface OracleClientPoolConfig {
  min?: number;
  max?: number;
  increment?: number;
  connectTimeout?: number;
  queueTimeout?: number;
  pingInterval?: number;
  stmtCacheSize?: number;
}

export interface OracleClientConfig {
  host?: string;
  port?: number;
  service?: string;
  user: string;
  password: string;
  /** Pre-built Oracle connect string; if omitted, built from host/port/service. */
  connectString?: string;
  mode?: 'thick' | 'thin';
  instantClientPath?: string;
  pool?: OracleClientPoolConfig;
  /**
   * node-oracledb's pool alias registry is PROCESS-WIDE, not per-instance --
   * `oracledb.createPool({ poolAlias: 'X' })` throws if a pool with alias
   * 'X' already exists anywhere in the process. Every `OracleClient` used
   * to hardcode `'HDSP_HIS'` here, which was fine when a process only ever
   * created exactly one `OracleClient` (the original single-tenant
   * `OraclePoolService`). Added 2026-07-21 for `OraclePoolManager`
   * (tenant-scoped Oracle pools, CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3),
   * which constructs one `OracleClient` per tenant IN THE SAME PROCESS --
   * without a distinct alias per instance, the second tenant's
   * `createPool()` call would throw immediately. Defaults to `'HDSP_HIS'`
   * when omitted, preserving exact existing behavior for every other
   * caller (self-hosted's single default pool, the standalone `connector/`
   * package).
   */
  poolAlias?: string;
}

export class HisUnavailableError extends Error {
  constructor(msg = 'HIS integration is currently unavailable') {
    super(msg);
    this.name = 'HisUnavailableError';
  }
}

export class OracleClient {
  private readonly logger: OracleClientLogger;
  private pool: OraclePool | null = null;
  private available = false;
  private connectedTo = '(not connected)';

  /**
   * Fail-fast circuit breaker -- identical semantics to the original
   * OraclePoolService: `isAvailable` only reflects whether the pool was
   * ever successfully created, never flips false just because a live
   * query/connection-acquire fails. Once a connection-acquire attempt
   * fails, further attempts short-circuit for COOLDOWN_MS.
   */
  private circuitOpenUntil = 0;
  private static readonly CIRCUIT_COOLDOWN_MS = 15_000;

  constructor(
    private readonly config: OracleClientConfig,
    logger?: OracleClientLogger,
  ) {
    this.logger = logger ?? consoleLogger;
  }

  get isAvailable(): boolean {
    return this.available;
  }

  get connectedTarget(): string {
    return this.connectedTo;
  }

  /** Loads the oracledb native module and initializes thick/thin mode -- same as OraclePoolService.onModuleInit(). */
  private initOracledb(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    oracledb = require('oracledb');

    if (this.config.mode === 'thick') {
      oracledb.initOracleClient(this.config.instantClientPath ? { libDir: this.config.instantClientPath } : undefined);
      this.logger.log('Oracle thick mode initialised');
    } else {
      this.logger.log('Oracle thin mode — no Instant Client required');
    }

    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    oracledb.fetchAsString = [oracledb.CLOB];
  }

  /** Equivalent to OraclePoolService.onModuleInit() -- call once at startup. */
  async connect(): Promise<void> {
    try {
      this.initOracledb();
      await this.createPool();
    } catch (err) {
      this.logger.warn(`Oracle HIS connection unavailable — HIS-dependent features will return 503: ${(err as Error).message}`);
      this.available = false;
    }
    this.logger.log(`[ORACLE STARTUP] available=${this.available} | connected=${this.connectedTo}`);
  }

  /** Equivalent to OraclePoolService.onModuleDestroy(). */
  async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.close(10);
        this.logger.log('Oracle connection pool closed');
      } catch (err) {
        this.logger.error(`Error closing Oracle pool: ${(err as Error).message}`);
      }
    }
  }

  private buildConnectString(): string {
    if (this.config.connectString) return this.config.connectString;
    return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${this.config.host})(PORT=${this.config.port ?? 1521}))(CONNECT_DATA=(SERVICE_NAME=${this.config.service})))`;
  }

  private async createPool(): Promise<void> {
    const cfg = this.config;
    const connectString = this.buildConnectString();
    if (!connectString || !cfg.user || !cfg.password) {
      this.logger.warn('Oracle connection string not configured — HIS integration disabled');
      return;
    }

    const target = `${cfg.user}@${cfg.host ?? '?'}:${cfg.port ?? 1521}/${cfg.service ?? '?'} (mode=${cfg.mode ?? 'thin'})`;
    this.logger.log(`[ORACLE] Connecting to ${target}`);

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        this.pool = await oracledb!.createPool({
          user: cfg.user,
          password: cfg.password,
          connectString,
          poolMin: cfg.pool?.min ?? 2,
          poolMax: cfg.pool?.max ?? 20,
          poolIncrement: cfg.pool?.increment ?? 2,
          poolTimeout: cfg.pool?.connectTimeout ?? 60,
          queueTimeout: cfg.pool?.queueTimeout ?? 60_000,
          poolPingInterval: cfg.pool?.pingInterval ?? 60,
          stmtCacheSize: cfg.pool?.stmtCacheSize ?? 30,
          poolAlias: cfg.poolAlias ?? 'HDSP_HIS',
        });

        this.available = true;
        this.connectedTo = target;
        this.logger.log(`[ORACLE] Pool ready → ${target}`);
        return;
      } catch (err) {
        this.logger.warn(`Oracle pool attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await this.sleep(2000 * attempt);
      }
    }

    this.logger.error(`[ORACLE] Pool creation failed after ${maxAttempts} attempts — HIS integration disabled`);
    this.available = false;
  }

  /**
   * Reconfigure the pool with new credentials.
   *
   * `onReconfigured` is called after a successful production (non-test)
   * reconfigure, so a caller can hook in side effects (e.g. the backend
   * wrapper clearing its Redis branch cache) without this package needing
   * to depend on Redis -- see this file's top doc comment.
   */
  async reconfigure(
    creds: {
      host?: string; port?: string; service?: string; user?: string; password?: string;
      mode?: string; poolMin?: string; poolMax?: string;
    },
    testOnly = false,
    onReconfigured?: () => void | Promise<void>,
  ): Promise<{ ok: boolean; message: string }> {
    if (!oracledb) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        oracledb = require('oracledb');
      } catch {
        return { ok: false, message: 'oracledb native module is not installed on this server' };
      }
    }

    const host = creds.host?.trim();
    const port = creds.port?.trim() || '1521';
    const service = creds.service?.trim();
    const user = creds.user?.trim();
    const password = creds.password?.trim();
    const mode = creds.mode?.trim() || 'thin';
    const poolMin = parseInt(creds.poolMin ?? '2', 10);
    const poolMax = parseInt(creds.poolMax ?? '20', 10);

    if (!host || !service || !user || !password) {
      return { ok: false, message: 'host, service, user, and password are all required' };
    }

    const connectString = `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SERVICE_NAME=${service})))`;
    const target = `${user}@${host}:${port}/${service} (mode=${mode})`;

    if (mode === 'thick' && !this.pool) {
      try {
        oracledb.initOracleClient(this.config.instantClientPath ? { libDir: this.config.instantClientPath } : undefined);
      } catch {
        // Already initialised in thick mode — ignore "already called" error
      }
    }

    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    oracledb.fetchAsString = [oracledb.CLOB];

    this.logger.log(`[ORACLE] Reconfiguring pool → ${target}${testOnly ? ' (test-only)' : ''}`);

    let newPool: OraclePool | null = null;
    try {
      const alias = testOnly ? `HDSP_HIS_TEST_${Date.now()}` : `HDSP_HIS_${Date.now()}`;
      newPool = await oracledb.createPool({
        user, password, connectString,
        poolMin, poolMax,
        poolIncrement: 2,
        poolTimeout: 30,
        queueTimeout: 60_000,
        poolPingInterval: 60,
        stmtCacheSize: 30,
        poolAlias: alias,
      });

      const conn = await newPool.getConnection();
      await conn.close();
    } catch (err) {
      if (newPool) {
        try { await newPool.close(0); } catch { /* ignore */ }
      }
      return { ok: false, message: `Connection failed: ${(err as Error).message}` };
    }

    if (testOnly) {
      try { await newPool.close(0); } catch { /* ignore */ }
      return { ok: true, message: `Connection to ${host}:${port}/${service} succeeded` };
    }

    const oldPool = this.pool;
    this.pool = newPool;
    this.available = true;
    this.connectedTo = target;

    if (oldPool) {
      try {
        await oldPool.close(10);
        this.logger.log('[ORACLE] Old pool drained and closed');
      } catch (err) {
        this.logger.warn(`Error closing old Oracle pool: ${(err as Error).message}`);
      }
    }

    this.logger.log(`[ORACLE] Pool reconfigured → ${target}`);

    if (onReconfigured) await onReconfigured();

    return { ok: true, message: `Oracle pool reconfigured: connected to ${host}:${port}/${service}` };
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    binds: OracleBindParameters = {},
    opts: { maxRows?: number } = {},
  ): Promise<T[]> {
    if (!this.available || !this.pool) {
      throw new HisUnavailableError('Oracle HIS connection is not available');
    }
    this.assertCircuitClosed();

    const cleanSql = sql.trim().replace(/;\s*$/, '');

    let connection: OracleConnection | null = null;
    try {
      connection = await this.acquireConnection();
      const result = await connection.execute(cleanSql, binds, {
        outFormat: oracledb!.OUT_FORMAT_OBJECT,
        maxRows: opts.maxRows ?? 500,
        fetchArraySize: 100,
      });
      return (result.rows ?? []) as T[];
    } finally {
      if (connection) {
        try { await connection.close(); } catch { /* ignore close errors */ }
      }
    }
  }

  async queryOne<T = Record<string, unknown>>(sql: string, binds: OracleBindParameters = {}): Promise<T | null> {
    const rows = await this.query<T>(sql, binds, { maxRows: 1 });
    return rows[0] ?? null;
  }

  async execute(sql: string, binds: OracleBindParameters = {}): Promise<number> {
    if (!this.available || !this.pool) {
      throw new HisUnavailableError('Oracle HIS connection is not available');
    }
    this.assertCircuitClosed();

    const cleanSql = sql.trim().replace(/;\s*$/, '');

    let connection: OracleConnection | null = null;
    try {
      connection = await this.acquireConnection();
      const result = await connection.execute(cleanSql, binds, { autoCommit: true });
      return result.rowsAffected ?? 0;
    } finally {
      if (connection) {
        try { await connection.close(); } catch { /* ignore close errors */ }
      }
    }
  }

  private assertCircuitClosed(): void {
    if (Date.now() < this.circuitOpenUntil) {
      throw new HisUnavailableError('Oracle HIS connection is temporarily unavailable (recent connection failure) — retrying shortly');
    }
  }

  private async acquireConnection(): Promise<OracleConnection> {
    try {
      const conn = await this.pool!.getConnection();
      this.circuitOpenUntil = 0;
      return conn;
    } catch (err) {
      this.circuitOpenUntil = Date.now() + OracleClient.CIRCUIT_COOLDOWN_MS;
      this.logger.warn(`Oracle connection acquisition failed — opening circuit for ${OracleClient.CIRCUIT_COOLDOWN_MS}ms: ${(err as Error).message}`);
      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
