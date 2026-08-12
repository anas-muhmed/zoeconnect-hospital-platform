import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleClient, OracleClientLogger, OracleClientConfig, HisUnavailableError } from '@hdsp/oracle-client';
import type { OracleBindParameters } from '@hdsp/oracle-client';
import { HisConfigService } from './config/his-config.service';
import { InjectRedis } from '../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { TenantContextService } from '../platform/tenant/tenant-context.service';

export type { OracleBindParameters };
export { HisUnavailableError };

/** Redis keys managed by BranchService — cleared after a pool reconfigure */
const BRANCH_CACHE_KEYS = ['hdsp:branches:all', 'hdsp:branches:all:stale'];

/** Sentinel pool key for self-hosted / no-ambient-tenant call sites (background jobs, startup). */
const DEFAULT_POOL_KEY = '__default__';

/** How long a non-default tenant's idle pool is kept open before being closed and evicted. */
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * OraclePoolManager (renamed from OraclePoolService, 2026-07-21,
 * CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3 — "tenant-scoped Oracle
 * architecture").
 *
 * Was: a thin NestJS DI wrapper around exactly ONE `@hdsp/oracle-client`
 * `OracleClient` instance, built once from `.env` in the constructor. That
 * was correct for self-hosted (one deployment = one Oracle DB = one
 * tenant) but wrong for cloud, where the intended architecture (per
 * explicit direction, reversing this roadmap's earlier middleware-first
 * draft) is: every cloud tenant connects DIRECTLY to its own Oracle HIS
 * database, with the connection strictly tenant-scoped. A single
 * process-wide pool cannot do that — every query from every tenant would
 * hit whichever DB the pool happened to be configured for.
 *
 * Now: holds a `Map<tenantKey, OracleClient>` instead of one client.
 *   - Resolves the CURRENT tenant from `TenantContextStorage` (ambient,
 *     populated by `TenantContextInterceptor` on every HTTP request from
 *     an interceptor-wrapped controller — see `HisController`/
 *     `HisSyncController`). Falls back to `DEFAULT_POOL_KEY` when there is
 *     no ambient tenant (self-hosted, or a background job with no HTTP
 *     request context — attendance pollers, this class's own startup).
 *   - `DEFAULT_POOL_KEY`'s pool is built from `.env` (`ConfigService.get
 *     ('oracle')`), then overridden by any `db.*` credentials the vendor
 *     portal has pushed into `HisSchemaConfig` for the 'default' tenant —
 *     BYTE-IDENTICAL to the old singleton's `onModuleInit()` behavior, and
 *     eagerly created at startup (not lazily) for the same reason: a
 *     self-hosted deployment should fail fast/log clearly on boot if
 *     Oracle is unreachable, not on the first request.
 *   - Every OTHER tenant's pool is built lazily, on first use, purely from
 *     that tenant's own `HisSchemaConfig` `db.*` rows (`HisConfigService.
 *     getConfig(tenantId)`, now tenant-scoped — see that file). There is
 *     no `.env` fallback for a real tenant: a cloud tenant with no stored
 *     Oracle credentials yet gets a clear `HisUnavailableError`, not
 *     another tenant's database.
 *   - Idle non-default pools are evicted (closed + removed from the map)
 *     after `DEFAULT_IDLE_TIMEOUT_MS` of no use, checked every
 *     `EVICTION_SWEEP_INTERVAL_MS` — cloud tenants that aren't actively
 *     querying HIS don't hold an open Oracle connection pool forever.
 *     `DEFAULT_POOL_KEY`'s pool is never evicted (self-hosted always needs
 *     it; it's also the boot-time health-check target for
 *     `AttendanceMonitoringService`/`PunchHistoryService`'s `isAvailable`
 *     checks, which predate multi-tenancy and reasonably mean "is HIS
 *     reachable for THIS deployment").
 *   - `oracledb`'s pool-alias registry is PROCESS-WIDE (see
 *     `OracleClientConfig.poolAlias`'s doc comment in `@hdsp/oracle-client`
 *     — added alongside this change) — each tenant's `OracleClient` gets a
 *     distinct alias (`HDSP_HIS_${tenantKey}`) so multiple tenants'
 *     concurrent pools in the same process don't collide.
 *
 * `reconfigure()` (used by the vendor portal's Oracle credential
 * test/push flow, `licensing/license.controller.ts`) now operates on the
 * CURRENT ambient tenant's pool, not always the default one — so a cloud
 * tenant's admin pushing new Oracle credentials reconfigures only that
 * tenant's pool.
 *
 * Every public method's signature is otherwise unchanged from the old
 * `OraclePoolService` — `DirectOracleTransport` and the handful of other
 * direct consumers (`AttendanceMonitoringService`, `PunchHistoryService`,
 * `LicenseController`) needed only an import rename, no call-site changes.
 */
@Injectable()
export class OraclePoolManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OraclePoolManager.name);
  private readonly nestLoggerAdapter: OracleClientLogger = {
    log: (m: string) => this.logger.log(m),
    warn: (m: string) => this.logger.warn(m),
    error: (m: string) => this.logger.error(m),
  };

  private readonly pools = new Map<string, { client: OracleClient; lastUsedAt: number }>();
  // In-flight pool-creation promises, keyed by tenant. Fixes a real race:
  // `getOrCreatePool()`'s check-then-set has an `await` between the `pools.
  // get()` read and the `pools.set()` write (buildConfigFor() + client.
  // connect() both await), so N concurrent first-requests for the same
  // cold tenant would all see `pools.get(tenantKey)` as undefined and each
  // independently call `new OracleClient()` + `client.connect()` --
  // node-oracledb's pool-alias registry is process-wide and this class
  // uses a deterministic alias per tenant (`HDSP_HIS_${tenantKey}`), so
  // the 2nd/3rd concurrent `createPool()` call would throw on a duplicate
  // alias, and whichever `pools.set()` won would silently leak the
  // others' already-opened connections (never tracked, never closed).
  // Every caller now awaits the SAME promise for a given tenant instead.
  private readonly poolCreationInFlight = new Map<string, Promise<OracleClient>>();
  private evictionTimer?: NodeJS.Timeout;
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly hisConfig?: HisConfigService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
    @Optional() private readonly tenantContext?: TenantContextStorage,
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {
    this.idleTimeoutMs = this.configService.get<number>('oracle.tenantPoolIdleTimeoutMs', DEFAULT_IDLE_TIMEOUT_MS);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  async onModuleInit(): Promise<void> {
    // Eagerly create + connect the default pool, exactly like the old
    // singleton did — self-hosted (and any request with no ambient
    // tenant) must not pay a first-request connection-latency penalty, and
    // startup should fail loudly/log clearly if Oracle is unreachable.
    await this.getOrCreatePool(DEFAULT_POOL_KEY);

    this.evictionTimer = setInterval(() => this.evictIdlePools(), EVICTION_SWEEP_INTERVAL_MS);
    this.evictionTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.evictionTimer) clearInterval(this.evictionTimer);
    await Promise.all(Array.from(this.pools.values()).map((entry) => entry.client.close()));
    this.pools.clear();
  }

  // ── Public API (unchanged signatures — now tenant-routed internally) ──────
  get isAvailable(): boolean {
    // Reflects the DEFAULT pool's health, matching every existing caller's
    // intent ("is HIS reachable for this deployment" — self-hosted health
    // checks, boot-time monitoring). A per-tenant availability check would
    // need a new method; nothing today asks for one.
    return this.pools.get(DEFAULT_POOL_KEY)?.client.isAvailable ?? false;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    binds: OracleBindParameters = {},
    opts: { maxRows?: number } = {},
  ): Promise<T[]> {
    const client = await this.getClientForCurrentTenant();
    return client.query<T>(sql, binds, opts);
  }

  async queryOne<T = Record<string, unknown>>(sql: string, binds: OracleBindParameters = {}): Promise<T | null> {
    const client = await this.getClientForCurrentTenant();
    return client.queryOne<T>(sql, binds);
  }

  async execute(sql: string, binds: OracleBindParameters = {}): Promise<number> {
    const client = await this.getClientForCurrentTenant();
    return client.execute(sql, binds);
  }

  /**
   * Reconfigure the CURRENT tenant's Oracle pool with new credentials
   * pushed from the vendor portal.
   * @param creds    - key→value map containing db.host, db.port, db.service, db.user, db.password
   * @param testOnly - when true, creates a throwaway pool just to verify connectivity,
   *                   then immediately closes it (used by the /oracle/test endpoint)
   */
  async reconfigure(
    creds: Record<string, string>,
    testOnly = false,
  ): Promise<{ ok: boolean; message: string }> {
    const tenantKey = await this.resolveTenantKey();
    const client = await this.getOrCreatePool(tenantKey);
    return client.reconfigure(
      {
        host: creds['db.host'],
        port: creds['db.port'],
        service: creds['db.service'],
        user: creds['db.user'],
        password: creds['db.password'],
        mode: creds['db.mode'],
        poolMin: creds['db.pool.min'],
        poolMax: creds['db.pool.max'],
      },
      testOnly,
      testOnly || tenantKey !== DEFAULT_POOL_KEY ? undefined : () => this.clearBranchCache(),
    );
  }

  // ── Tenant resolution + pool management ────────────────────────────────────

  // Maps the ambient ('default' tenant OR none) case to DEFAULT_POOL_KEY,
  // any real other tenant to its own UUID as the pool key. Critical: a
  // self-hosted request's ambient tenant IS the real 'default' tenant's
  // UUID (not null) once HisController/HisSyncController are
  // interceptor-wrapped -- without this comparison, self-hosted would
  // route through the non-default branch of buildConfigFor() (stored
  // his_schema_config credentials only, no .env fallback), breaking any
  // self-hosted deployment that configures Oracle via .env instead of
  // pushing db.* through the vendor portal.
  private async resolveTenantKey(): Promise<string> {
    if (!this.tenantContext) return DEFAULT_POOL_KEY;
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) return DEFAULT_POOL_KEY;

    if (this.tenantContextService) {
      try {
        const defaultTenantId = await this.tenantContextService.getCurrentTenantId();
        if (tenantId === defaultTenantId) return DEFAULT_POOL_KEY;
      } catch {
        // Default tenant row not found (shouldn't happen post-migration) --
        // fall through and treat this tenantId as a real, distinct pool key.
      }
    }
    return tenantId;
  }

  private async getClientForCurrentTenant(): Promise<OracleClient> {
    const tenantKey = await this.resolveTenantKey();
    return this.getOrCreatePool(tenantKey);
  }

  private async getOrCreatePool(tenantKey: string): Promise<OracleClient> {
    const existing = this.pools.get(tenantKey);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.client;
    }

    // Share one in-flight creation across every concurrent caller for this
    // tenant -- see poolCreationInFlight's doc comment above.
    const inFlight = this.poolCreationInFlight.get(tenantKey);
    if (inFlight) return inFlight;

    const creation = (async () => {
      try {
        const config = await this.buildConfigFor(tenantKey);
        const client = new OracleClient(config, this.nestLoggerAdapter);
        await client.connect();
        this.pools.set(tenantKey, { client, lastUsedAt: Date.now() });
        return client;
      } finally {
        this.poolCreationInFlight.delete(tenantKey);
      }
    })();

    this.poolCreationInFlight.set(tenantKey, creation);
    return creation;
  }

  private async buildConfigFor(tenantKey: string): Promise<OracleClientConfig> {
    const envCfg = this.configService.get('oracle') ?? {};
    const poolTuning = {
      min: envCfg.pool?.min,
      max: envCfg.pool?.max,
      increment: envCfg.pool?.increment,
      connectTimeout: envCfg.pool?.connectTimeout,
      queueTimeout: envCfg.pool?.queueTimeout,
      pingInterval: envCfg.pool?.pingInterval,
      stmtCacheSize: envCfg.pool?.stmtCacheSize,
    };
    const instantClientPath = this.configService.get<string>('oracle.instantClientPath');
    const poolAlias = `HDSP_HIS_${tenantKey}`;

    if (tenantKey === DEFAULT_POOL_KEY) {
      // Byte-identical to the old singleton's constructor + onModuleInit:
      // start from .env, then override with stored db.* credentials if
      // the vendor portal has pushed any for the default tenant.
      const base: OracleClientConfig = {
        host: envCfg.host,
        port: envCfg.port,
        service: envCfg.service,
        user: envCfg.user,
        password: envCfg.password,
        connectString: envCfg.connectString,
        mode: envCfg.mode ?? 'thin',
        instantClientPath,
        pool: poolTuning,
        poolAlias,
      };

      if (this.hisConfig) {
        try {
          // No explicit tenantId: ambient resolves to either nothing
          // (startup, no HTTP context) or the real 'default' tenant's UUID
          // (mid-request, self-hosted) -- HisConfigService.resolveTenantId()
          // falls back to the same 'default' tenant lookup either way.
          const stored = await this.hisConfig.getConfig();
          if (stored['db.host'] && stored['db.user'] && stored['db.password']) {
            this.logger.log(
              `Stored DB credentials found in HIS config (host=${stored['db.host']}, service=${stored['db.service'] ?? '?'}, user=${stored['db.user']}) — overriding .env pool for default tenant`,
            );
            return this.mergeStoredCreds(base, stored, poolAlias);
          }
        } catch (err) {
          this.logger.warn(`Could not apply stored DB credentials for default tenant: ${(err as Error).message}`);
        }
      }
      return base;
    }

    // Real, non-default tenant: Oracle credentials come ONLY from that
    // tenant's own stored his_schema_config rows -- no .env fallback. A
    // tenant with nothing configured yet gets a clear error, not another
    // tenant's (or self-hosted's) database.
    if (!this.hisConfig) {
      throw new HisUnavailableError(
        `Oracle connectivity for tenant "${tenantKey}" is unavailable — HIS configuration service is not wired up.`,
      );
    }
    const stored = await this.hisConfig.getConfig(tenantKey);
    if (!stored['db.host'] || !stored['db.user'] || !stored['db.password']) {
      throw new HisUnavailableError(
        `Tenant "${tenantKey}" has no Oracle database configured yet — set Database Connection fields in HIS Configuration first.`,
      );
    }
    return this.mergeStoredCreds(
      { mode: 'thin', instantClientPath, pool: poolTuning, poolAlias, user: '', password: '' },
      stored,
      poolAlias,
    );
  }

  private mergeStoredCreds(
    base: OracleClientConfig,
    stored: Record<string, string>,
    poolAlias: string,
  ): OracleClientConfig {
    return {
      ...base,
      host: stored['db.host'],
      port: stored['db.port'] ? Number(stored['db.port']) : base.port,
      service: stored['db.service'],
      user: stored['db.user'],
      password: stored['db.password'],
      mode: (stored['db.mode'] as 'thick' | 'thin' | undefined) ?? base.mode,
      pool: {
        ...base.pool,
        min: stored['db.pool.min'] ? Number(stored['db.pool.min']) : base.pool?.min,
        max: stored['db.pool.max'] ? Number(stored['db.pool.max']) : base.pool?.max,
      },
      poolAlias,
    };
  }

  private evictIdlePools(): void {
    const now = Date.now();
    for (const [tenantKey, entry] of this.pools) {
      if (tenantKey === DEFAULT_POOL_KEY) continue; // self-hosted's pool is never evicted
      if (now - entry.lastUsedAt > this.idleTimeoutMs) {
        entry.client.close().catch((err: Error) =>
          this.logger.warn(`Error closing idle Oracle pool for tenant=${tenantKey}: ${err.message}`),
        );
        this.pools.delete(tenantKey);
        this.logger.log(`Evicted idle Oracle pool for tenant=${tenantKey} (idle > ${this.idleTimeoutMs / 60000}min)`);
      }
    }
  }

  private async clearBranchCache(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(...BRANCH_CACHE_KEYS);
      this.logger.log('[ORACLE] Branch Redis cache cleared — next login will fetch from new DB');
    } catch (err) {
      this.logger.warn(`Could not clear branch cache: ${(err as Error).message}`);
    }
  }
}

/**
 * Backward-compat alias (2026-07-21): a handful of test files
 * (`reference.service.spec.ts`, attendance service specs) reference the
 * old class name `OraclePoolService` directly, either as a DI token
 * (`{ provide: OraclePoolService, useValue: ... }`) or a mock's type
 * annotation. Since this is the exact same class object, not a copy,
 * `provide: OraclePoolService` and `provide: OraclePoolManager` bind to
 * the identical token — no test behavior changes. New code should use
 * `OraclePoolManager` directly; this alias exists only so tonight's rename
 * doesn't require touching every test file under time pressure.
 */
export { OraclePoolManager as OraclePoolService };
