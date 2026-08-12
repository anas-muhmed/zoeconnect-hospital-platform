import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';

const DEFAULT_TENANT_CODE = 'default';

/**
 * TenantContextService (Phase 1 — Hybrid Architecture roadmap, Task 1.1;
 * extended Phase 8, Task 8.2).
 *
 * `getCurrentTenantId()` (the UUID primary key) is the primary API —
 * every `tenant_id` column added in A2+ stores the UUID, not the code,
 * so business repositories should call this rather than resolving the
 * code to an ID themselves. Resolution is lazy: no database query runs
 * until the first call to `getCurrentTenantId()`, at which point the
 * result is cached in memory for the process lifetime. This keeps A1
 * free of any startup-time database dependency.
 *
 * `resolveTenantBySubdomain()` (Task 8.2) is the real per-request
 * resolution the class-level doc comment used to describe as "arrives in
 * Phase 8" — it now exists. Self-hosted installs have no `subdomain`
 * column populated on any `Tenant` row (only the seeded 'default' tenant
 * exists, with `subdomain: null`), so this method naturally falls through
 * to `null` for every self-hosted request, and the middleware that calls
 * it (`SubdomainTenantMiddleware`) falls back to `getCurrentTenantId()`'s
 * 'default' resolution in that case — zero behavior change for any
 * existing deployment.
 */
@Injectable()
export class TenantContextService {
  private readonly logger = new Logger(TenantContextService.name);
  private cachedTenantIdPromise: Promise<string> | null = null;

  /**
   * Small in-memory cache (subdomain -> {tenant, expiresAt}), TTL-bounded
   * (see SUBDOMAIN_CACHE_TTL_MS below) rather than permanent.
   *
   * Fix (2026-07-20, real incident): this used to be an unbounded Map that
   * cached negative lookups (`null`) forever, on the reasoning that
   * self-hosted's subdomain never resolves and there's no point re-querying
   * Postgres every request. That reasoning doesn't hold for cloud: cloud
   * tenants are provisioned at RUNTIME by the Vendor Portal
   * (TenantProvisioningService), typically while this backend process is
   * already up. A single request for a brand-new tenant's subdomain
   * arriving before that tenant existed (or racing its creation) would
   * cache a `null` for the lifetime of the process -- every subsequent
   * request for that tenant's subdomain would then permanently fail to
   * resolve (falling through to the 'default' tenant lookup, which doesn't
   * exist at all in a pure-cloud DB, throwing, and surfacing as "Unable to
   * resolve tenant for this request" on every login) until the backend was
   * restarted. TTL-bounding in both directions also fixes the mirror-image
   * problem: a positive hit cached forever would keep resolving a
   * deprovisioned tenant's subdomain as if still active.
   */
  private readonly subdomainCache = new Map<string, { tenant: Tenant | null; expiresAt: number }>();
  private static readonly SUBDOMAIN_CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /**
   * Resolves a `Tenant` by its `subdomain` column. Returns `null` (never
   * throws) when no tenant matches — the caller (middleware) is
   * responsible for deciding what "no match" means (fall back to
   * 'default', or reject the request, depending on deployment mode).
   * Lookups (both hits and misses) are cached for
   * `SUBDOMAIN_CACHE_TTL_MS` — long enough to avoid a Postgres round trip
   * on every request for the common case, short enough that a tenant
   * provisioned (or deprovisioned) while this process is already running
   * becomes correctly resolvable (or stops resolving) within 30 seconds,
   * not "never until restart".
   *
   * Subdomain matching is case-insensitive: `extractSubdomain()` already
   * lowercases the incoming Host header label, and this lowercases again
   * defensively so any caller (or any tenant row whose subdomain was
   * stored with different casing) still matches.
   */
  async resolveTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
    const key = subdomain.toLowerCase();
    const cached = this.subdomainCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tenant;
    }
    const tenant = await this.tenantRepo.findOne({ where: { subdomain: key, status: 'active' } });
    this.subdomainCache.set(key, { tenant: tenant ?? null, expiresAt: Date.now() + TenantContextService.SUBDOMAIN_CACHE_TTL_MS });
    return tenant ?? null;
  }

  /**
   * Phase 8 (Task 8.6) — returns every `active` tenant's UUID, for
   * cron/interval jobs to iterate over explicitly (each iteration should be
   * wrapped in `TenantContextStorage.run(tenantId, ...)` so any nested
   * `currentTenantIdOrNull()`-based write-stamping resolves correctly,
   * instead of the `null` it would otherwise get with no ambient context).
   * Self-hosted installs have exactly one row here (the seeded 'default'
   * tenant), so every job's behavior is unchanged there -- one iteration,
   * same as today's single global pass.
   */
  async getActiveTenantIds(): Promise<string[]> {
    const tenants = await this.tenantRepo.find({ where: { status: 'active' }, select: ['id'] });
    return tenants.map((t) => t.id);
  }

  /**
   * Returns the current tenant's UUID (primary key). This is what every
   * `tenant_id` column stores — business repositories should call this,
   * not `getCurrentTenantCode()`, to avoid a code→UUID lookup per request.
   * Resolved lazily on first call and cached thereafter.
   */
  async getCurrentTenantId(): Promise<string> {
    if (!this.cachedTenantIdPromise) {
      this.cachedTenantIdPromise = this.resolveDefaultTenantId();
    }
    return this.cachedTenantIdPromise;
  }

  private async resolveDefaultTenantId(): Promise<string> {
    const tenant = await this.tenantRepo.findOne({ where: { code: DEFAULT_TENANT_CODE } });
    if (!tenant) {
      // Reset so a subsequent call can retry rather than caching a permanent failure
      // (e.g. if this races the SeedDefaultTenant migration in a fresh environment).
      this.cachedTenantIdPromise = null;
      throw new Error(
        `No tenant row found for code='${DEFAULT_TENANT_CODE}' — has the SeedDefaultTenant migration run?`,
      );
    }
    return tenant.id;
  }

  /**
   * Returns the current tenant's human-readable `code`. Useful for
   * routing, diagnostics, URLs, onboarding, and logging — not for
   * building queries (use `getCurrentTenantId()` for that). Synchronous,
   * no database access, hardcoded until Task 1.5's middleware exists.
   */
  getCurrentTenantCode(): string {
    return DEFAULT_TENANT_CODE;
  }

  /**
   * Resolves a `Tenant`'s UUID by its `code` column. Used by the path-based
   * `/player/:tenantCode/*` public routes.
   * - In self-hosted mode: always resolves to the single 'default' tenant.
   * - In cloud production: requires an exact match in the DB, else returns null (404).
   * - In cloud local dev: falls back to the 'default' tenant if the code is missing.
   */
  async resolveTenantIdByCode(code: string): Promise<string | null> {
    if (process.env.DEPLOYMENT_MODE !== 'cloud') {
      return this.resolveDefaultTenantId();
    }

    const key = code.toLowerCase();
    const tenant = await this.tenantRepo.findOne({ where: { code: key, status: 'active' } });
    
    if (tenant) {
      return tenant.id;
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`Tenant code '${code}' not found. Falling back to default tenant because NODE_ENV is not production.`);
      return this.resolveDefaultTenantId();
    }

    return null;
  }
}
