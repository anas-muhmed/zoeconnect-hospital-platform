import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { HisSchemaConfig } from './his-schema-config.entity';
import { User } from '../../users/entities/user.entity';
import { assertGlobalIdentityAvailable } from '../../users/global-identity-conflict.util';
import { Role } from '../../rbac/entities/role.entity';
import { Tenant } from '../../platform/tenant/entities/tenant.entity';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/** Redis cache key for the full config map */
const REDIS_KEY   = 'his:schema:config';
/** TTL: 1 hour — refreshed on every push from vendor portal */
const CACHE_TTL_S = 3600;

/**
 * HisConfigService
 *
 * Provides a single method — `getConfig()` — that returns the full
 * key→value map of Oracle identifiers for this ZoeConnect instance.
 *
 * Cache strategy:
 *   1. Hot path:   Redis GET   (< 1 ms)
 *   2. Cold path:  PostgreSQL  (all rows, ~1–5 ms) → write to Redis
 *   3. Invalidate: call invalidateCache() after a HIS_CONFIG_UPDATE webhook
 *
 * Usage in HIS services:
 *   const cfg = await this.hisConfig.getConfig();
 *   const sql = `SELECT ... FROM ${cfg['billing.table']} b WHERE b.${cfg['billing.col.mrn']} = :mrn`;
 *
 * Tenant-Scoped User Identity, Task 10 — this WAS a known residual gap
 * (deliberately not fixed at the time, same "latent, not live" reasoning
 * as Task 8): `HisSchemaConfig.configKey` became tenant-scoped (composite
 * unique constraint, see `applyWebhookUpdate()`'s doc comment below), but
 * `getConfig()`/`loadFromDb()`/`REDIS_KEY` were not — they read/cached
 * every row across every tenant into one flat map keyed only by
 * `REDIS_KEY`, byte-identical-safe only because self-hosted has exactly
 * one tenant.
 *
 * Fixed 2026-07-21 (CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3 — tenant-scoped
 * Oracle architecture): `getConfig(explicitTenantId?)` now resolves a
 * tenant — the explicit param if given, else the ambient
 * `TenantContextStorage` value (populated by `TenantContextInterceptor`,
 * now applied to `HisController`/`HisSyncController` — see those files),
 * else the seeded 'default' tenant — and both the Redis key and the DB
 * query are scoped to it. Every existing call site (`getConfig()` with no
 * args) keeps working unchanged: self-hosted requests always resolve to
 * 'default' exactly as before (same tenant, same rows, same cache
 * behavior), and cloud requests now correctly resolve to the requesting
 * tenant instead of silently reading/caching a mixed-tenant map. Same
 * "ambient-first, explicit-override-available" pattern used by
 * `TokenService.getLocations()` earlier this session.
 */
@Injectable()
export class HisConfigService implements OnModuleInit {
  private readonly logger = new Logger(HisConfigService.name);

  constructor(
    @InjectRepository(HisSchemaConfig)
    private readonly repo: Repository<HisSchemaConfig>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRedis() private readonly redis: Redis,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /** Always reload from DB on startup — guarantees stale Redis cache is overwritten (default tenant only; see loadFromDb()). */
  async onModuleInit() {
    try {
      await this.loadFromDb();
      this.logger.log('HIS schema config loaded into Redis cache from DB (default tenant)');
    } catch (err) {
      this.logger.warn(`Failed to pre-warm HIS schema config: ${(err as Error).message}`);
    }
  }

  /**
   * Resolves which tenant's config to use: explicit param wins, else the
   * ambient `TenantContextStorage` value (HTTP requests through
   * `HisController`/`HisSyncController`, now interceptor-wrapped), else
   * the seeded 'default' tenant (background jobs with no HTTP context —
   * attendance pollers, `OraclePoolManager`'s own startup — and every
   * self-hosted request, which only ever has 'default' anyway).
   */
  private async resolveTenantId(explicitTenantId?: string | null): Promise<string> {
    if (explicitTenantId) return explicitTenantId;
    const ambient = await this.tenantContext.currentTenantIdOrNull();
    if (ambient) return ambient;
    return this.resolveDefaultTenantId();
  }

  /**
   * Returns the full config map: { 'billing.table': 'BILL_MASTER', ... }
   * Redis-cached per tenant; falls back to DB on cache miss.
   */
  async getConfig(explicitTenantId?: string | null): Promise<Record<string, string>> {
    const tenantId = await this.resolveTenantId(explicitTenantId);

    // ── Hot path: Redis ───────────────────────────────────────────────────
    const cached = await this.redis.get(`${REDIS_KEY}:${tenantId}`);
    if (cached) {
      return JSON.parse(cached) as Record<string, string>;
    }

    // ── Cold path: DB ─────────────────────────────────────────────────────
    return this.loadFromDb(tenantId);
  }

  /**
   * Receives the full key→value map from a vendor webhook push,
   * upserts every entry into the DB, then refreshes the Redis cache.
   *
   * Tenant-Scoped User Identity, Task 10: `HisSchemaConfig.configKey`'s
   * unique constraint was widened to a composite `(tenantId, configKey)` --
   * this method's upsert now reuses the same `resolveTargetTenant()`
   * tenant-fallback bridge Task 8 built for `applyHdspUsers()` in this same
   * class, rather than re-inventing it. `tenantId` is optional and omitted
   * by every confirmed-live caller today (self-hosted `Hospital`
   * deployments), so this falls back to the seeded 'default' tenant,
   * preserving pre-Task-10 behavior exactly for that path.
   *
   * Returns the resolved `targetTenant.id` on success, or `null` if the
   * batch was empty or the tenant couldn't be resolved (mirrors the two
   * early-return branches below). D.3 ("Dynamic Per-Tenant HIS Query
   * Architecture" Publisher, 2026-07-21) added this return value so
   * `LicenseController` can trigger `HisQueryDefinitionPublisherService.
   * publishChanged()` for the SAME tenant this method actually wrote to,
   * without re-deriving `resolveTargetTenant()`'s fallback logic at the
   * call site. Every pre-existing caller ignores the return value --
   * `Promise<void>` -> `Promise<string | null>` is source-compatible with
   * every `await this.applyWebhookUpdate(...)` call site that doesn't use
   * the result.
   */
  async applyWebhookUpdate(updates: Record<string, string>, tenantId?: string): Promise<string | null> {
    const entries = Object.entries(updates);
    if (!entries.length) return null;

    let targetTenant: { id: string; code: string };
    try {
      targetTenant = await this.resolveTargetTenant(tenantId);
    } catch (err) {
      this.logger.error(`HIS_CONFIG_UPDATE: aborting batch of ${entries.length} key(s) — ${(err as Error).message}`);
      return null;
    }

    this.logger.log(`HIS_CONFIG_UPDATE: applying ${entries.length} key(s) (tenant=${targetTenant.code})`);

    // Upsert each key (conflict on (tenant_id, config_key) → update
    // config_value + updated_at). Oracle identifiers (table/column names)
    // are stored uppercase. db.* (credentials, host names) and sql.* (raw
    // SQL) must preserve case.
    for (const [key, value] of entries) {
      const preserveCase =
        key.startsWith('db.') ||
        key.startsWith('sql.') ||
        key.startsWith('attendance.runtime.') ||
        key.startsWith('attendance.dependency.') ||
        key.startsWith('attendance.recon.') ||
        key.startsWith('attendance.retroactive.');
      await this.repo.upsert(
        {
          configKey:   key,
          configValue: preserveCase ? String(value) : String(value).toUpperCase(),
          tenantId:    targetTenant.id,
        },
        { conflictPaths: ['configKey', 'tenantId'] },
      );
    }

    // Refresh Redis cache immediately -- scoped to the tenant just written,
    // not every tenant (fixed alongside getConfig()/loadFromDb() above).
    await this.loadFromDb(targetTenant.id);
    this.logger.log('HIS schema config cache refreshed after webhook update');
    return targetTenant.id;
  }

  /** Drop the Redis key for one tenant (default: the ambient/resolved tenant) so the next getConfig() re-reads from DB. */
  async invalidateCache(explicitTenantId?: string | null): Promise<void> {
    const tenantId = await this.resolveTenantId(explicitTenantId);
    await this.redis.del(`${REDIS_KEY}:${tenantId}`);
    this.logger.debug(`HIS schema config cache invalidated (tenant=${tenantId})`);
  }

  /**
   * Upsert ZoeConnect user accounts pushed from the vendor portal.
   * Conflict key: (tenantId, username) — see Task 5's composite unique
   * constraint; a bare `username` lookup is no longer sufficient to
   * identify "the same user" now that usernames are only unique per tenant.
   * Role names ('ADMIN', 'STAFF') are matched against the local roles table
   * by name (Role is a global catalog — see `resolveRoles()`'s doc comment
   * in `UsersService`).
   *
   * Tenant-Scoped User Identity, Task 8 (this method): `tenantId` is the
   * `Tenant.id` UUID carried on `VendorWebhookDto.tenantId`, optional and
   * omitted by every confirmed-live caller today. Self-hosted `Hospital`
   * deployments (`HospitalsService.pushHisConfigWithUsers()` in the vendor
   * portal) are single-tenant by construction — each runs its own isolated
   * ZoeConnect backend + DB with only the seeded 'default' tenant — so they have
   * no real tenant UUID to send, and this method falls back to
   * `resolveDefaultTenantId()`, preserving pre-Task-8 behavior exactly for
   * that path. When `tenantId` IS supplied (a future multi-tenant cloud
   * HIS-sync sender — `CloudTenantsService` has no such feature yet, see
   * `CloudTenant.hdspTenantId`), it is validated against the real `Tenant`
   * table and the whole batch is rejected if it doesn't resolve — silently
   * falling back to 'default' on a bad tenant UUID would be worse than
   * failing loudly, since it would mis-tenant every user in the batch.
   */
  private cachedDefaultTenantId: string | null = null;
  private async resolveDefaultTenantId(): Promise<string> {
    if (this.cachedDefaultTenantId) return this.cachedDefaultTenantId;
    const tenant = await this.tenantRepo.findOne({ where: { code: 'default' } });
    if (!tenant) {
      throw new Error(
        'ZoeConnect user sync: seeded "default" tenant not found -- ensure database migrations and seeding have run.',
      );
    }
    this.cachedDefaultTenantId = tenant.id;
    return tenant.id;
  }

  /**
   * Resolves the target tenant for a batch: the explicitly-supplied
   * `tenantId` (validated against the real Tenant table) when present,
   * otherwise the seeded 'default' tenant. Returns both the id and the
   * tenant's `code`, since the code is also used to build a
   * tenant-qualified placeholder email for newly-created users.
   */
  private async resolveTargetTenant(tenantId?: string): Promise<{ id: string; code: string }> {
    if (!tenantId) {
      const id = await this.resolveDefaultTenantId();
      return { id, code: 'default' };
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new Error(
        `ZoeConnect user sync: tenantId "${tenantId}" supplied on webhook payload does not match any known tenant -- refusing to apply this batch to avoid mis-tenanting users.`,
      );
    }
    return { id: tenant.id, code: tenant.code };
  }

  async applyHdspUsers(
    users: Array<{
      username: string;
      passwordHash: string;
      role: 'ADMIN' | 'STAFF';
      fullName: string | null;
      isActive: boolean;
    }>,
    tenantId?: string,
  ): Promise<void> {
    if (!users.length) return;

    let targetTenant: { id: string; code: string };
    try {
      targetTenant = await this.resolveTargetTenant(tenantId);
    } catch (err) {
      this.logger.error(`ZoeConnect user sync: aborting batch of ${users.length} user(s) — ${(err as Error).message}`);
      return;
    }

    // Cache role lookups for this batch
    const roleCache = new Map<string, Role>();
    const getRole = async (name: string): Promise<Role | null> => {
      if (roleCache.has(name)) return roleCache.get(name)!;
      const role = await this.roleRepo.findOne({ where: { name } });
      if (role) roleCache.set(name, role);
      return role ?? null;
    };

    for (const u of users) {
      try {
        const role = await getRole(u.role);
        if (!role) {
          this.logger.warn(`ZoeConnect user sync: role "${u.role}" not found — skipping user "${u.username}"`);
          continue;
        }

        // Task 5 note: lookup must be scoped by tenant now that
        // (tenantId, username) — not username alone — is the real unique
        // key; otherwise this could find/overwrite another tenant's user
        // with the same username.
        const existing = await this.userRepo.findOne({
          where: { username: u.username, tenantId: targetTenant.id },
        });
        if (existing) {
          // Update password hash, role, fullName, isActive -- tenantId
          // deliberately untouched (the lookup above already scoped to
          // targetTenant.id, so it's already correct).
          existing.passwordHash = u.passwordHash;
          existing.roles        = [role];
          existing.fullName     = u.fullName;
          existing.isActive     = u.isActive;
          await this.userRepo.save(existing);
          this.logger.debug(`ZoeConnect user updated: ${u.username} (tenant=${targetTenant.code})`);
        } else {
          // Create — generate a placeholder email since email is required.
          // Tenant-qualified (username@<tenantCode>.hdsp.local) only when a
          // real non-default tenant was supplied, so self-hosted's existing
          // username@hdsp.local emails are unchanged for the only
          // confirmed-live caller today.
          const email = targetTenant.code === 'default'
            ? `${u.username}@hdsp.local`
            : `${u.username}@${targetTenant.code}.hdsp.local`;

          // ZoeConnect Identity Architecture Migration, Phase 4.1: global,
          // case-insensitive duplicate check before creating a NEW row --
          // the `existing` lookup just above is deliberately still
          // tenant-scoped (it's an upsert key: "does this tenant already
          // have this HIS-synced username", not a uniqueness guard), but a
          // brand-new row can still collide with another tenant's username
          // or generated placeholder email now that both are globally
          // unique at the DB level (Phase 4). Thrown as a ConflictException,
          // which the surrounding try/catch below already logs and skips --
          // same graceful per-user degradation as any other failure in this
          // loop, just with a clear message instead of a raw driver error.
          await assertGlobalIdentityAvailable(this.userRepo, { username: u.username, email });

          const user = this.userRepo.create({
            username:           u.username,
            email,
            passwordHash:       u.passwordHash,
            fullName:           u.fullName,
            roles:              [role],
            isActive:           u.isActive,
            mustChangePassword: false,
            tenantId:           targetTenant.id,
          });
          await this.userRepo.save(user);
          this.logger.log(`ZoeConnect user provisioned: ${u.username} (${u.role}, tenant=${targetTenant.code})`);
        }
      } catch (err) {
        this.logger.error(`Failed to upsert ZoeConnect user "${u.username}": ${(err as Error).message}`);
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Defaults to the 'default' tenant (self-hosted, and startup pre-warm) when omitted. */
  private async loadFromDb(explicitTenantId?: string): Promise<Record<string, string>> {
    const tenantId = explicitTenantId ?? await this.resolveDefaultTenantId();
    const rows = await this.repo.find({ where: { tenantId } });
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.configKey] = row.configValue;
    }
    await this.redis.setex(`${REDIS_KEY}:${tenantId}`, CACHE_TTL_S, JSON.stringify(map));
    return map;
  }
}
