import {
  Injectable, Logger, OnModuleInit, Inject,
  BadRequestException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { InjectRedis } from '../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LicenseMaster } from './entities/license-master.entity';
import { VendorRegistration } from './entities/vendor-registration.entity';
import { AuditService } from '../audit/audit.service';
import { CACHE_KEYS } from '../../config/redis.config';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { TenantContextService } from '../platform/tenant/tenant-context.service';

export type LicenseModule = 'PLATFORM' | 'LOYALTY' | 'FORMS' | 'QUEUE' | 'FEEDBACK' | 'EIC' | 'ATTENDANCE' | 'CMS' | 'INCIDENT' | 'CHILDRENS_VILLAGE' | 'MORTUARY' | 'DRUG_INDENTING' | 'LIFEGENX';

/**
 * Every module code that actually gates something in ZoeConnect -- the union of
 * `@RequireModule(...)` call sites, `isModuleLicensed(...)` call sites, and
 * frontend `requiresModule` tile gates. This is the canonical "everything"
 * list used to widen access during an active trial (see `refreshCache()`).
 * `TOKEN` is deliberately excluded -- seeded as `license_required: false`
 * in `module_registry`, i.e. always-on regardless of license.
 *
 * Frontend integration Phase 1: MORTUARY, DRUG_INDENTING, LIFEGENX added
 * (registered in `module_registry` via their own `Register<X>Module`
 * migrations) so their `requiresModule` sidebar/dashboard/ModuleGate
 * entries resolve during an active trial, same as every other module
 * here. None of these three modules' backend controllers apply
 * `LicenseGuard`/`@RequireModule` themselves yet (only `JwtAuthGuard`+
 * `PermissionsGuard`) -- that's a deliberate, separate decision, not
 * changed by this addition. CliniGrowth is NOT listed here: it
 * intentionally reuses `PLATFORM` (already licensed for every tenant),
 * not a module code of its own.
 */
export const ALL_MODULE_CODES: LicenseModule[] = ['PLATFORM', 'LOYALTY', 'FORMS', 'QUEUE', 'FEEDBACK', 'EIC', 'ATTENDANCE', 'CMS', 'INCIDENT', 'CHILDRENS_VILLAGE', 'MORTUARY', 'DRUG_INDENTING', 'LIFEGENX'];

export interface LicensePayload {
  licenseKey: string;
  hospitalName: string;
  hospitalCode: string;
  issuedAt: string;
  expiresAt: string | null;
  modules: LicenseModule[];
  maxUsers: number;
  machineFingerprint: string | null;
}

export interface SignedLicense extends LicensePayload {
  signature: string;
}

export interface LicenseStatus {
  isValid: boolean;
  isTrial: boolean;
  hospitalName: string;
  hospitalCode: string;
  licensedModules: string[];
  maxUsers: number;
  expiresAt: Date | null;          // soonest expiry across all active records
  daysRemaining: number | null;    // days until soonest expiry
  isExpiringSoon: boolean;         // any record within warn window
  machineFingerprint: string | null;
  /** Per-module expiry dates — null means perpetual for that module */
  moduleExpiries: Record<string, Date | null>;
  /** True when the license has technically expired but is still within the 1-day grace period */
  isInGracePeriod: boolean;
  /** When the grace period ends; null if not currently in a grace period */
  gracePeriodEndsAt: Date | null;
  /** Modules whose license has expired but are still accessible within the grace period */
  gracePeriodModules: string[];
  deploymentMode: string;
  vendorRegistrationRequired: boolean;
}

// What actually gets persisted on the trial's DB row -- kept narrow (PLATFORM
// only) as an accurate audit record of what was formally granted at signup.
// This is NOT the effective access a trial user gets: `refreshCache()` widens
// `licensedModules` to `ALL_MODULE_CODES` for as long as the trial is active
// (see the `hasTrial` branch below), so prospective customers can evaluate
// every module, not just Platform Core, during the trial window. Once the
// trial expires (or a real license is uploaded), the DB row's narrow
// `licensedModules` is what's left to fall back on.
const TRIAL_MODULES: LicenseModule[] = ['PLATFORM'];
const TRIAL_DURATION_DAYS = 30;
const EXPIRY_WARN_DAYS = 30;
const GRACE_PERIOD_DAYS = 1;   // 1-day grace period after expiry before access is fully blocked
const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private publicKeyPem: string;

  // --- Passive health-check state (readiness follow-up, 2026-08) ----------
  // CRITICAL FIX: LicenseHealthIndicator used to call getStatus() directly
  // on every readiness poll -- a real DB/Redis round-trip on Docker's own
  // HEALTHCHECK cadence (every 15s, per-container), which multiplies out
  // to a permanent background query load with no relationship to actual
  // traffic (20 tenants x 5 backend replicas x 15s = a continuous stream
  // of license lookups solely because Docker wanted a liveness answer).
  // These two fields are updated ONLY as a side effect of real business
  // traffic (onModuleInit()'s one-time boot check, and getStatus()'s own
  // normal cache-hit/cache-miss paths) -- never by the health check
  // itself. getHealthSnapshot() below is a synchronous, zero-I/O read of
  // whatever was last recorded that way.
  private initialized = false;
  private lastSuccessfulCheck: Date | null = null;

  constructor(
    @InjectRepository(LicenseMaster) private readonly licenseRepo: Repository<LicenseMaster>,
    @InjectRepository(VendorRegistration) private readonly regRepo: Repository<VendorRegistration>,
    @InjectRedis() private readonly redis: Redis,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,

    // Licensing Module Tenant-Scoping Migration, Phase 3 of 6 -- scoped
    // repo for getHistory() (JWT-authenticated GET /license/history) only.
    // getStatus()/processWebhookEvent()/onModuleInit()/resetToTrial() stay
    // on the raw licenseRepo above: their aggregation semantics ("this
    // backend's overall license state") are FileLicenseProvider/self-hosted's
    // actual, unchanged business rule (single tenant by construction, one
    // backend = one hospital) -- redefining that aggregation to be
    // per-tenant would be a business-logic change to license computation,
    // which this migration deliberately does not make. New rows created by
    // uploadLicense() are still stamped with tenantId (write-path pattern,
    // see below), so the data itself is correctly attributed even though
    // getStatus()'s read-side aggregation intentionally stays global.
    @Inject(getTenantScopedRepositoryToken(LicenseMaster))
    private readonly scopedLicenseRepo: TenantScopedRepository<LicenseMaster>,
    private readonly tenantContext: TenantContextStorage,

    // Self-review fix (finding 5) -- resolves the 'default' tenant's UUID
    // when activateTrial() runs at boot (onModuleInit()), where no ambient
    // TenantContextStorage context exists yet. Same precedent already used
    // by SubdomainTenantMiddleware for exactly this "no ambient context"
    // case. Self-hosted: resolves once, cached, always 'default'. Cloud:
    // if the seeded 'default' tenant row doesn't exist for some reason,
    // resolution is wrapped in try/catch at the call site below rather than
    // failing app boot.
    private readonly tenantContextService: TenantContextService,
  ) {
    this.publicKeyPem = this.loadPublicKey();
  }

  /**
   * Single source of truth for deployment mode + the `vendorRegistrationRequired`
   * flag, replacing two separately-duplicated `process.env.DEPLOYMENT_MODE`
   * reads below (one per LicenseStatus construction site). Routed through
   * ConfigService (`deployment.mode`, deployment.config.ts) rather than a raw
   * env read, consistent with the rest of the config layer.
   *
   * NOTE: `vendorRegistrationRequired` is still derived purely from
   * deployment mode here, not from whether a VendorRegistration row actually
   * exists — unchanged from the pre-existing behavior. Whether it *should*
   * also check actual registration state (so a failed/absent auto-registration
   * in cloud mode doesn't leave the frontend's "Register with Vendor" button
   * hidden with no fallback) is a product/business-rule decision, not a
   * config-plumbing one, and is left for review rather than changed here.
   *
   * Made `public` (ZoeConnect Identity Architecture Migration) so
   * `LicenseController.getStatus()` can attach these two fields to the
   * `ILicenseProvider`-sourced response it now builds for cloud tenants --
   * see that method's own doc comment for why the response can't come from
   * this service's own `getStatus()` alone anymore.
   */
  public getDeploymentMode(): string {
    return this.config.get<string>('deployment.mode', 'self_hosted');
  }

  public isVendorRegistrationRequired(): boolean {
    return this.getDeploymentMode() !== 'cloud';
  }

  /**
   * Real incident (2026-08-07): the frontend used to carry its own copy of
   * this value as a `NEXT_PUBLIC_MARKETING_SITE_URL` build-time constant
   * (AuthProvider.tsx's post-logout hand-off back to the marketing site's
   * `/sign-in` page for users who arrived via its SSO). That var was never
   * wired into the `hdsp-frontend` image's build args (same gap as the
   * `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` incidents), so every
   * production build baked in its hardcoded fallback,
   * `http://localhost:3010` -- users were sent there on logout instead of
   * the real marketing site.
   *
   * Fixed the same way `deploymentMode` already was (see that method's own
   * doc comment): stop giving the frontend a second, separately-maintained
   * copy of a value the backend already owns. `app.publicLoginUrl`
   * (`PUBLIC_LOGIN_URL` env var, app.config.ts) is the existing single
   * source of truth for the marketing site's origin -- already used by
   * TenantProvisioningService and main.ts's CORS setup. Exposed here so
   * `LicenseController.getStatus()` can attach it to the same
   * `GET /license/status` payload the frontend already fetches live on
   * every logout, instead of the frontend baking its own guess in at build
   * time.
   */
  public getPublicLoginUrl(): string {
    return this.config.get<string>('app.publicLoginUrl', 'https://zoeconnect.in/sign-in');
  }

  /**
   * Self-review fix (Redis-key audit, requested alongside findings 1-5) --
   * resolves the tenant key CACHE_KEYS.LICENSE(...) is stored/read under.
   * Priority: explicit `tenantId` param (passed by FileLicenseProvider,
   * which gets it from LicenseGuard's `request.user.tenantId`) > ambient
   * TenantContextStorage context (JWT-authenticated routes under
   * TenantContextInterceptor, e.g. register()/submitRequest()'s
   * getStatus() calls) > TenantContextService's 'default'-tenant lookup
   * (the same fallback activateTrial() uses at boot). That third fallback
   * is what guarantees self-hosted, and any call site with no ambient
   * context (background jobs, the @Public() /license/status route),
   * always resolve to the SAME single tenant key -- no cache
   * fragmentation, nothing changes functionally there. Only returns the
   * 'global' sentinel if every real resolution attempt fails (e.g.
   * SeedDefaultTenant hasn't run yet).
   *
   * IMPORTANT SCOPE NOTE: this only fixes which cache key a status is
   * stored under. It does NOT scope refreshCache()'s underlying DB query,
   * which deliberately still aggregates every ACTIVE/TRIAL/EXPIRED
   * LicenseMaster row regardless of tenant (see refreshCache()'s own doc
   * comment) -- that is a separate, larger business-logic decision this
   * fix does not make.
   */
  private async resolveLicenseCacheTenantKey(explicitTenantId?: string | null): Promise<string> {
    if (explicitTenantId) return explicitTenantId;
    const ambient = await this.tenantContext.currentTenantIdOrNull();
    if (ambient) return ambient;
    try {
      return await this.tenantContextService.getCurrentTenantId();
    } catch (err) {
      this.logger.warn(`Could not resolve a tenant for the LICENSE cache key, using 'global': ${(err as Error).message}`);
      return 'global';
    }
  }

  // ── Startup: ensure at least a trial license exists ─────────────────────────
  async onModuleInit(): Promise<void> {
    // Bust the cache on every startup so the grace-period logic runs fresh against the DB.
    // This ensures a previously-cached "expired" status doesn't block access during the grace window.
    const cacheTenantKey = await this.resolveLicenseCacheTenantKey();
    try {
      await this.redis.del(CACHE_KEYS.LICENSE(cacheTenantKey));
      this.logger.log('License cache cleared on startup — will rebuild from DB on first request');
    } catch (err) {
      this.logger.warn(`Failed to clear license cache on startup: ${(err as Error).message}`);
    }

    const count = await this.licenseRepo.count();
    if (count === 0) {
      this.logger.warn('No license found — activating 30-day TRIAL license');
      // Self-review fix (finding 5): stamp the boot-created trial row with
      // a tenantId so it isn't silently invisible to getHistory() (scoped
      // since Phase 3). Reuses the same resolution cacheTenantKey above
      // already performed (defensive: falls back to null, not 'global',
      // if resolution genuinely failed -- identical to the pre-fix
      // behavior for that edge case, and matches activateTrial()'s
      // null-tolerant signature).
      const bootTenantId = cacheTenantKey !== 'global' ? cacheTenantKey : null;
      await this.activateTrial(bootTenantId);
    } else {
      this.logger.log('License record found — skipping trial setup');
    }

    // Reaching here proves the license repository is reachable and the
    // boot-time trial-activation logic completed without throwing --
    // exactly the "subsystem initialized" signal a passive health check
    // needs, recorded once at boot rather than re-verified on every poll.
    this.initialized = true;
  }

  /**
   * Synchronous, zero-I/O snapshot for LicenseHealthIndicator (readiness
   * follow-up, 2026-08). Deliberately does NOT call getStatus() or touch
   * the DB/Redis -- see the `initialized`/`lastSuccessfulCheck` fields'
   * own doc comment for why. `staleSeconds` is informational only (a
   * cache-TTL-aligned "how long since a real request last exercised this
   * subsystem"), not itself a failure condition: a backend with no recent
   * license-checking traffic is a normal, healthy state, not a degraded
   * one -- the health check should never manufacture business activity
   * just to keep its own signal fresh.
   */
  getHealthSnapshot(): { initialized: boolean; lastSuccessfulCheck: Date | null; staleSeconds: number | null } {
    return {
      initialized: this.initialized,
      lastSuccessfulCheck: this.lastSuccessfulCheck,
      staleSeconds: this.lastSuccessfulCheck
        ? Math.floor((Date.now() - this.lastSuccessfulCheck.getTime()) / 1000)
        : null,
    };
  }

  // ── Get current license status (Redis-cached, DB fallback) ──────────────────
  // `tenantId` is optional: FileLicenseProvider passes through the value
  // LicenseGuard resolved from `request.user.tenantId`; every other
  // existing caller (isModuleLicensed(), vendor-sync.service.ts,
  // license.controller.ts's @Public() status route) keeps calling with no
  // argument, exactly as before -- resolveLicenseCacheTenantKey()'s
  // ambient/TenantContextService fallback chain handles those the same
  // way it always implicitly did (self-hosted: always 'default').
  async getStatus(tenantId?: string): Promise<LicenseStatus> {
    const cacheTenantKey = await this.resolveLicenseCacheTenantKey(tenantId);
    try {
      const cached = await this.redis.get(CACHE_KEYS.LICENSE(cacheTenantKey));
      if (cached) {
        const parsed = JSON.parse(cached) as LicenseStatus;
        this.logger.debug(`License from cache: modules=${parsed.licensedModules.join(',')}`);
        // Passive health-check state (see getHealthSnapshot()'s doc
        // comment): recorded here as a side effect of REAL traffic
        // reaching this method, never by the health check itself.
        this.lastSuccessfulCheck = new Date();
        return parsed;
      }
    } catch (err) {
      this.logger.warn(`Redis get failed, falling back to DB: ${(err as Error).message}`);
    }
    const result = await this.refreshCache(cacheTenantKey);
    this.lastSuccessfulCheck = new Date();
    return result;
  }

  // ── Check if a specific module is licensed ───────────────────────────────────
  async isModuleLicensed(moduleCode: string): Promise<boolean> {
    const status = await this.getStatus();
    return status.isValid && status.licensedModules.includes(moduleCode);
  }

  // ── Upload & activate a new license ─────────────────────────────────────────
  async uploadLicense(
    rawLicense: Record<string, unknown>,
    activatedById: string | null,
  ): Promise<LicenseStatus> {
    const license = rawLicense as unknown as SignedLicense;

    // 1. Verify RSA signature
    if (!this.verifySignature(license)) {
      throw new BadRequestException('License signature is invalid — the file may be tampered');
    }

    // 2. Check expiry
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      throw new UnprocessableEntityException('This license has already expired');
    }

    // 3. Validate machine fingerprint
    if (license.machineFingerprint) {
      const localFp = this.getMachineFingerprint();
      if (license.machineFingerprint !== localFp) {
        throw new UnprocessableEntityException(
          `Machine fingerprint mismatch. Expected ${license.machineFingerprint}, got ${localFp}`,
        );
      }
    }

    // 4. Compute tamper-detection hash of the raw payload
    const metadataHash = this.hashLicense(license);

    // Write-path tenant stamping (same currentTenantIdOrNull() pattern as
    // CmsAuditService.log()/VendorSyncService.register()): defensive by
    // design -- returns null rather than throwing when called from a
    // context with no tenant established yet (harmless; matches
    // pre-migration behavior for that case). Resolved once, up front, so
    // both the idempotency early-return below and the final cache-bust
    // use the exact same LICENSE cache key.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const cacheTenantKey = await this.resolveLicenseCacheTenantKey(tenantId);

    // 5. Idempotency — if this exact license key was already activated, skip
    const existing = await this.licenseRepo.findOne({ where: { licenseKey: license.licenseKey } });
    if (existing) {
      this.logger.warn(`License ${license.licenseKey} already in DB — skipping duplicate activation`);
      return this.refreshCache(cacheTenantKey);
    }

    // 6. Persist — do NOT revoke existing records.
    //    Each vendor approval is stored as an independent record.
    //    getStatus() / refreshCache() aggregates across all active records.
    const entity = this.licenseRepo.create({
      licenseKey: license.licenseKey,
      hospitalName: license.hospitalName,
      hospitalCode: license.hospitalCode,
      issuedAt: new Date(license.issuedAt),
      expiresAt: license.expiresAt ? new Date(license.expiresAt) : null,
      licensedModules: license.modules,
      maxUsers: license.maxUsers,
      machineFingerprint: license.machineFingerprint ?? null,
      status: 'ACTIVE',
      rawLicense: license as unknown as Record<string, unknown>,
      metadataHash,
      activatedBy: activatedById,
      tenantId,
    });
    await this.licenseRepo.save(entity);

    // 6. Bust cache
    await this.redis.del(CACHE_KEYS.LICENSE(cacheTenantKey));

    await this.auditService.log({
      action: 'LICENSE_ACTIVATED',
      module: 'PLATFORM',
      userId: activatedById ?? undefined,
      entityType: 'license',
      entityId: license.licenseKey,
      newValue: {
        hospitalCode: license.hospitalCode,
        modules: license.modules,
        expiresAt: license.expiresAt,
      },
    });

    this.logger.log(`License activated: ${license.hospitalCode} | modules: ${license.modules.join(',')}`);
    return this.refreshCache(cacheTenantKey);
  }

  // ── Machine fingerprint ──────────────────────────────────────────────────────
  getMachineFingerprint(): string {
    const hostname = os.hostname();
    const macs: string[] = [];
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const addr of iface ?? []) {
        if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
          macs.push(addr.mac);
        }
      }
    }
    macs.sort();
    const raw = `${hostname}:${macs.join(',')}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  // ── License history (all records, newest first) ──────────────────────────────
  // JWT-authenticated route (GET /license/history, PLATFORM:SETTINGS:READ) --
  // scoped to the current tenant so an admin can't see another tenant's
  // license activation history on a shared cloud backend. Self-hosted:
  // identical result to the pre-migration global query, since 'default' is
  // the only tenant and every existing row was just backfilled to it.
  async getHistory(): Promise<LicenseMaster[]> {
    return this.scopedLicenseRepo.find({ order: { activatedAt: 'DESC' } });
  }

  // ── Webhook event handlers (called by LicenseController) ────────────────────

  async processWebhookEvent(event: {
    type: string;
    signedLicense?: Record<string, unknown>;
    reason?: string;
    forceLogout?: boolean;
    reset?: boolean;
    modules?: string[];
    newExpiresAt?: string;
    vendorRequestId?: string;
  }): Promise<{ ok: boolean; message: string }> {
    switch (event.type) {
      case 'REGISTRATION_CONFIRMED':
        this.logger.log('Vendor confirmed registration');
        return { ok: true, message: 'Registration acknowledged' };

      case 'LICENSE_APPROVED': {
        if (!event.signedLicense) throw new Error('signedLicense missing in LICENSE_APPROVED event');
        await this.uploadLicense(event.signedLicense, null); // null = system-activated via vendor webhook
        this.logger.log('License activated via vendor webhook');
        return { ok: true, message: 'License activated' };
      }

      case 'TRIAL_EXTENDED': {
        if (!event.newExpiresAt) throw new Error('newExpiresAt missing in TRIAL_EXTENDED event');
        // Fix (webhook handler consistency, requested alongside findings
        // 1-5): same reasoning as LICENSE_REVOKED -- this handler runs
        // inside the ambient tenant TenantContextStorage.run(reg.tenantId,
        // ...) establishes around the whole verified-webhook dispatch.
        // Resolve it and prefer the current tenant's own TRIAL/ACTIVE
        // record over any other tenant's when one is present, so one
        // tenant's TRIAL_EXTENDED event can't extend a different tenant's
        // license on a shared cloud backend. Self-hosted: tenantId always
        // resolves to 'default', and every row was backfilled to it, so
        // this returns the exact same record the old unscoped lookup did
        // -- zero behavior change. System scope (no tenantId -- the
        // untouched internal-provision path) falls back to the original
        // global lookup, preserving that path's pre-fix behavior exactly.
        const tenantId = await this.tenantContext.currentTenantIdOrNull();
        const license = await this.licenseRepo.findOne({
          where: tenantId
            ? [{ status: 'TRIAL', tenantId }, { status: 'ACTIVE', tenantId }]
            : [{ status: 'TRIAL' }, { status: 'ACTIVE' }],
          order: { activatedAt: 'DESC' },
        });
        if (!license) throw new Error('No active license to extend');
        license.expiresAt = new Date(event.newExpiresAt);
        await this.licenseRepo.save(license);
        await this.redis.del(CACHE_KEYS.LICENSE(await this.resolveLicenseCacheTenantKey(tenantId)));
        this.logger.log(`Trial extended to ${event.newExpiresAt}`);
        return { ok: true, message: 'Trial extended' };
      }

      case 'MODULE_REVOKED': {
        if (!event.modules?.length) throw new Error('modules array missing in MODULE_REVOKED event');
        // Fix (webhook handler consistency): same tenant-scoping reasoning
        // as TRIAL_EXTENDED immediately above.
        const tenantId = await this.tenantContext.currentTenantIdOrNull();
        const license = await this.licenseRepo.findOne({
          where: tenantId ? { status: 'ACTIVE', tenantId } : { status: 'ACTIVE' },
          order: { activatedAt: 'DESC' },
        });
        if (!license) throw new Error('No active license found');
        license.licensedModules = license.licensedModules.filter(
          (m) => !event.modules!.includes(m),
        );
        await this.licenseRepo.save(license);
        await this.redis.del(CACHE_KEYS.LICENSE(await this.resolveLicenseCacheTenantKey(tenantId)));
        this.logger.warn(`Modules revoked: ${event.modules.join(', ')}`);
        return { ok: true, message: `Modules revoked: ${event.modules.join(', ')}` };
      }

      case 'LICENSE_REVOKED': {
        // Self-review fix (finding 1): this handler runs inside the
        // ambient tenant context LicenseController's vendorWebhook()
        // establishes (TenantContextStorage.run(reg.tenantId, ...) /
        // runAsSystem()) around the whole verified-webhook dispatch. Scope
        // the revocation to that tenant when one is present so one
        // tenant's LICENSE_REVOKED event can't revoke every other tenant's
        // license on a shared cloud backend. Self-hosted: the webhook's
        // registration row always resolves to the 'default' tenant
        // (backfilled), so tenantId here is always 'default' -- the
        // WHERE clause matches every row self-hosted ever had, identical
        // to the pre-fix unscoped UPDATE. System scope (no tenantId --
        // i.e. the still-untouched internal-provision path, whose rows
        // have tenant_id IS NULL) falls back to the original global
        // UPDATE, preserving that path's pre-fix behavior exactly.
        const tenantId = await this.tenantContext.currentTenantIdOrNull();

        const revokeQuery = this.licenseRepo.createQueryBuilder()
          .update()
          .set({ status: 'REVOKED' });
        if (tenantId) revokeQuery.where('tenant_id = :tenantId', { tenantId });
        await revokeQuery.execute();
        await this.redis.del(CACHE_KEYS.LICENSE(await this.resolveLicenseCacheTenantKey(tenantId)));

        // Force-logout on a full revocation.
        //
        // IMPORTANT (found while making this tenant-aware, not something
        // this fix introduces): this was already dead code before today,
        // globally, for every deployment -- two independent reasons:
        //   1. The ioredis client here is configured with
        //      `keyPrefix: 'hdsp:'` (redis.provider.ts), which ioredis
        //      auto-prepends to the pattern argument of KEYS too -- so the
        //      old `this.redis.keys('hdsp:refresh:*')` actually searched
        //      for `hdsp:hdsp:refresh:*`, which can never match anything.
        //   2. Even with that fixed, no code anywhere in this codebase
        //      ever writes a `refresh:*`-shaped key. AuthService's refresh
        //      tokens are stateless signed JWTs (verified via
        //      `jwtService.verify`, no DB or Redis-backed store) and the
        //      only session-related Redis keys that actually exist are
        //      per-access-token (`JWT_BLACKLIST(jti)`, `SESSION_ACTIVITY(jti)`)
        //      -- neither is enumerable by user or tenant without a reverse
        //      index that doesn't exist yet.
        // So this call has never force-logged-out anyone, on any
        // deployment, tenant-scoped or not. Making it tenant-aware doesn't
        // change that -- there's nothing real underneath it to scope yet.
        // Fixed the key-prefix bug so the pattern is at least well-formed,
        // and scoped it in preparation for when real session tracking
        // exists, but logging now says what actually happened instead of
        // implying a bulk logout occurred. Building the actual session
        // index (so this can force-logout a specific tenant's users) is
        // the backlog item flagged separately -- not done here, the night
        // before a deploy, as a new architecture change.
        const sessionKeys = await this.redis.keys('refresh:*');
        if (sessionKeys.length > 0) await this.redis.del(...sessionKeys);
        this.logger.warn(
          `License revoked (tenant=${tenantId ?? 'system'}) -- ${sessionKeys.length} session key(s) matched ` +
          `(expected 0 today: no tenant-aware session store exists yet, see comment above)`,
        );

        if (event.reset) {
          // Hospital was deleted from vendor portal — wipe registration and restart as trial
          await this.resetToTrial(event.reason ?? 'Hospital deleted from vendor portal', tenantId);
          return { ok: true, message: 'License revoked and instance reset to trial' };
        }

        this.logger.warn(`License fully revoked. Reason: ${event.reason ?? 'unspecified'}`);
        return { ok: true, message: 'License revoked' };
      }

      case 'REQUEST_REJECTED':
        // Handled by VendorSyncService.markRequestResolved — nothing to do in LicenseService
        return { ok: true, message: 'Request rejection recorded' };

      default:
        this.logger.warn(`Unknown webhook event type: ${event.type}`);
        return { ok: false, message: `Unknown event type: ${event.type}` };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Wipe all vendor registration records and re-create a fresh trial license.
   * Called when the hospital record is deleted from the vendor portal, so ZoeConnect
   * returns to the same state as a brand-new installation.
   *
   * Self-review fix (finding 1): `tenantId` is the ambient tenant the
   * triggering LICENSE_REVOKED webhook resolved to (passed down from
   * `processWebhookEvent()`, which read it off `TenantContextStorage`
   * while still inside the controller's `TenantContextStorage.run(...)`
   * wrapper). When present, every delete below is scoped to that tenant
   * so this reset can't destroy another tenant's registrations, licenses,
   * or users on a shared cloud backend. Self-hosted: tenantId always
   * resolves to the 'default' tenant (every row was backfilled to it), so
   * the scoped deletes match every row the old unscoped deletes did --
   * zero behavior change. `tenantId === null` (system scope -- the
   * still-untouched internal-provision path's rows) falls back to the
   * original global deletes, preserving that path's pre-fix behavior
   * exactly rather than silently leaving its data un-resettable.
   */
  private async resetToTrial(reason: string, tenantId: string | null): Promise<void> {
    if (tenantId) {
      // Remove this tenant's vendor registration records (unlinks ZoeConnect from vendor portal)
      await this.regRepo.createQueryBuilder()
        .delete()
        .where('tenant_id = :tenantId', { tenantId })
        .execute();

      // Clear this tenant's existing license records (already REVOKED above)
      await this.licenseRepo.createQueryBuilder()
        .delete()
        .where('tenant_id = :tenantId', { tenantId })
        .execute();

      // Delete this tenant's provisioned (non-SUPER_ADMIN) users.
      // These were created via the vendor portal webhook and belong to the old hospital.
      await this.dataSource.query(
        `
        DELETE FROM users
        WHERE tenant_id = $1
          AND role_id NOT IN (
            SELECT id FROM roles WHERE name = 'SUPER_ADMIN'
          )
      `,
        [tenantId],
      );
    } else {
      // System scope (no tenant context established) -- preserve the
      // pre-fix global behavior verbatim for the untouched
      // internal-provision path.
      await this.regRepo.createQueryBuilder().delete().execute();
      await this.licenseRepo.createQueryBuilder().delete().execute();
      await this.dataSource.query(`
        DELETE FROM users
        WHERE role_id NOT IN (
          SELECT id FROM roles WHERE name = 'SUPER_ADMIN'
        )
      `);
    }
    this.logger.warn('Cleared all non-SUPER_ADMIN users as part of trial reset');

    // Start a fresh trial, stamped with the same tenant that was just reset
    // (finding 5 -- see activateTrial()).
    await this.activateTrial(tenantId);
    await this.redis.del(CACHE_KEYS.LICENSE(await this.resolveLicenseCacheTenantKey(tenantId)));

    this.logger.warn(`Instance reset to trial. Reason: ${reason}`);

    await this.auditService.log({
      action: 'INSTANCE_RESET_TO_TRIAL',
      module: 'PLATFORM',
      entityType: 'license',
      newValue: { reason },
    });
  }

  /**
   * Self-review fix (finding 5): stamps the created row with `tenantId`
   * when one is available (boot-time resolution via TenantContextService
   * for `onModuleInit()`, or the ambient tenant passed through from
   * `resetToTrial()`) so it isn't silently invisible to `getHistory()`
   * (tenant-scoped since Phase 3). `tenantId` may legitimately be `null`
   * (default-tenant lookup failed at boot, or system scope) -- the row is
   * still created either way, matching pre-fix behavior for that edge case.
   */
  private async activateTrial(tenantId: string | null): Promise<void> {
    const expiresAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 86_400_000);
    const trialKey = crypto.randomUUID();
    const raw = {
      licenseKey: trialKey,
      hospitalName: 'Trial Installation',
      hospitalCode: 'TRIAL',
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      modules: TRIAL_MODULES,
      maxUsers: 5,
      machineFingerprint: null,
      signature: 'TRIAL',
    };
    const entity = this.licenseRepo.create({
      licenseKey: trialKey,
      hospitalName: 'Trial Installation',
      hospitalCode: 'TRIAL',
      issuedAt: new Date(),
      expiresAt,
      licensedModules: TRIAL_MODULES,
      maxUsers: 5,
      machineFingerprint: null,
      status: 'TRIAL',
      rawLicense: raw as Record<string, unknown>,
      metadataHash: 'TRIAL',
      activatedBy: null,
      tenantId,
    });
    await this.licenseRepo.save(entity);
  }

  // -- Private helpers -------------------------------------------------------

  private loadPublicKey(): string {
    if (process.env.LICENSE_PUBLIC_KEY_PATH) {
      const envPath = path.resolve(process.env.LICENSE_PUBLIC_KEY_PATH);
      if (fs.existsSync(envPath)) {
        this.logger.log(`Loaded public key from env path: ${envPath}`);
        return fs.readFileSync(envPath, 'utf-8');
      }
      this.logger.warn(`LICENSE_PUBLIC_KEY_PATH set but file not found: ${envPath}`);
    }
    // Try multiple locations — robust against different CWDs at runtime
    const candidates = [
      path.join(process.cwd(), 'keys', 'license-public.pem'),
      path.join(__dirname, '..', '..', '..', '..', 'keys', 'license-public.pem'),
      path.join(__dirname, '..', '..', '..', 'keys', 'license-public.pem'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        this.logger.log(`Loaded public key from ${p}`);
        return fs.readFileSync(p, 'utf-8');
      }
    }
    this.logger.error(`License public key NOT FOUND (tried: ${candidates.join(', ')}) — RSA verification will fail`);
    return '';
  }

  private verifySignature(license: SignedLicense): boolean {
    if (!this.publicKeyPem) return false;
    try {
      const { signature } = license;
      // Must match the vendor canonical key order exactly (signing.service.ts ORDERED_KEYS)
      const ORDERED_KEYS = [
        'licenseKey', 'hospitalName', 'hospitalCode',
        'issuedAt', 'expiresAt', 'modules', 'maxUsers', 'machineFingerprint',
      ] as const;
      const canonical: Record<string, unknown> = {};
      for (const k of ORDERED_KEYS) canonical[k] = (license as unknown as Record<string, unknown>)[k];
      const data = JSON.stringify(canonical);
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(data);
      return verify.verify(this.publicKeyPem, signature, 'base64');
    } catch (err) {
      this.logger.error(`Signature verification error: ${(err as Error).message}`);
      return false;
    }
  }

  private hashLicense(license: SignedLicense): string {
    return crypto.createHash('sha256').update(JSON.stringify(license)).digest('hex');
  }

  /**
   * `cacheTenantKey` (self-review fix, Redis-key audit) only determines
   * which CACHE_KEYS.LICENSE(...) entry the computed status is written
   * to/read from -- it does NOT scope the query directly below. That
   * query deliberately still aggregates every ACTIVE/TRIAL/EXPIRED
   * LicenseMaster row in the table regardless of tenant, matching this
   * migration's own explicit, previously-reviewed decision (see this
   * class's constructor comment: "redefining that aggregation to be
   * per-tenant would be a business-logic change to license computation,
   * which this migration deliberately does not make"). Flagged separately
   * as its own decision point -- not changed here.
   */
  private async refreshCache(cacheTenantKey: string): Promise<LicenseStatus> {
    const now = new Date();

    // Fetch ACTIVE, TRIAL, and EXPIRED records — EXPIRED ones are re-evaluated for grace period.
    // A record that was previously marked EXPIRED may still be within the 1-day grace window.
    const records = await this.licenseRepo.find({
      where: [{ status: 'ACTIVE' }, { status: 'TRIAL' }, { status: 'EXPIRED' }],
      order: { activatedAt: 'DESC' },
    });

    const GRACE_MS = GRACE_PERIOD_DAYS * 86_400_000;
    const expiredIds: string[] = [];          // ACTIVE/TRIAL records past grace → mark EXPIRED in DB
    const gracePeriodEndDates: Date[] = [];   // dates when grace windows close
    const gracePeriodRecordIds = new Set<string>(); // records currently in grace period

    const activeRecords = records.filter(r => {
      if (r.expiresAt && r.expiresAt < now) {
        const graceEnd = new Date(r.expiresAt.getTime() + GRACE_MS);
        if (graceEnd < now) {
          // Fully past grace period — if ACTIVE/TRIAL, mark EXPIRED in DB; exclude either way
          if (r.status !== 'EXPIRED') expiredIds.push(r.id);
          return false;
        }
        // Within grace period — treat as active but flag the record
        gracePeriodEndDates.push(graceEnd);
        gracePeriodRecordIds.add(r.id);
        return true;
      }
      // Not yet expired
      return r.status !== 'EXPIRED'; // exclude EXPIRED records that somehow have future expiresAt
    });
    if (expiredIds.length) {
      await this.licenseRepo.createQueryBuilder()
        .update()
        .set({ status: 'EXPIRED' })
        .whereInIds(expiredIds)
        .execute();
    }

    this.logger.log(`refreshCache: ${activeRecords.length} active record(s), modules=${JSON.stringify(activeRecords.map(r => r.licensedModules))}`);

    if (!activeRecords.length) {
      const fallback: LicenseStatus = {
        isValid: false, isTrial: false,
        hospitalName: '', hospitalCode: '',
        licensedModules: [], maxUsers: 0,
        expiresAt: null, daysRemaining: null,
        isExpiringSoon: false, machineFingerprint: null,
        moduleExpiries: {},
        isInGracePeriod: false,
        gracePeriodEndsAt: null,
        gracePeriodModules: [],
        deploymentMode: this.getDeploymentMode(),
        vendorRegistrationRequired: this.isVendorRegistrationRequired(),
      };
      return fallback;
    }

    // Aggregate: union of all active modules
    const licensedModulesSet = new Set<string>();
    const gracePeriodModulesSet = new Set<string>(); // modules accessible only via grace period
    const moduleExpiries: Record<string, Date | null> = {};
    let soonestExpiry: Date | null = null;
    let maxUsers = 0;
    const newestRecord = activeRecords[0]; // most recently activated

    for (const r of activeRecords) {
      const inGrace = gracePeriodRecordIds.has(r.id);
      for (const mod of r.licensedModules) {
        licensedModulesSet.add(mod);
        if (inGrace) gracePeriodModulesSet.add(mod);
        // Track per-module expiry: keep the LATEST expiry for each module
        // (a re-approval should extend, not shorten, the module's access)
        const existing = moduleExpiries[mod];
        if (existing === undefined) {
          moduleExpiries[mod] = r.expiresAt;
        } else if (existing !== null && (r.expiresAt === null || r.expiresAt > existing)) {
          moduleExpiries[mod] = r.expiresAt; // null = perpetual (best case)
        }
      }
      // Soonest expiry across records (for banner warning)
      if (r.expiresAt !== null) {
        if (soonestExpiry === null || r.expiresAt < soonestExpiry) {
          soonestExpiry = r.expiresAt;
        }
      }
      maxUsers = Math.max(maxUsers, r.maxUsers);
    }

    const hasTrial = activeRecords.every(r => r.status === 'TRIAL');

    // Full-platform trial: while every active record is a TRIAL (not expired,
    // not mixed with a real license), treat every registered module as
    // licensed -- not just the narrow `TRIAL_MODULES` actually persisted on
    // the DB row. A hospital evaluating ZoeConnect needs to see Feedback, CMS,
    // Queue, EIC, Loyalty etc. in action, not just Platform Core; a trial
    // that only unlocks one module defeats the purpose of a trial. This
    // flows through to every consumer for free (LicenseGuard/@RequireModule,
    // isModuleLicensed(), and every frontend read of `licensedModules`) since
    // they all funnel through this one cached status object -- no call site
    // elsewhere needs to know trial vs. real license. Falls back to the real,
    // narrow `licensedModules` union computed above the moment the trial
    // record itself expires past its grace period (excluded from
    // `activeRecords` already) or a real license is uploaded alongside it
    // (`hasTrial` becomes false as soon as any non-TRIAL record is active).
    if (hasTrial) {
      for (const mod of ALL_MODULE_CODES) {
        licensedModulesSet.add(mod);
        if (moduleExpiries[mod] === undefined) {
          // Trial modules beyond what's actually persisted don't have their
          // own per-module expiry record -- they ride on the trial's overall
          // expiry, same as PLATFORM does above.
          moduleExpiries[mod] = newestRecord.expiresAt;
        }
      }
    }

    const daysRemaining = soonestExpiry
      ? Math.ceil((soonestExpiry.getTime() - now.getTime()) / 86_400_000)
      : null;

    const isInGracePeriod = gracePeriodEndDates.length > 0;
    const gracePeriodEndsAt = isInGracePeriod
      ? gracePeriodEndDates.reduce((min, d) => (d < min ? d : min))
      : null;

    const status: LicenseStatus = {
      isValid: true,
      isTrial: hasTrial,
      hospitalName: newestRecord.hospitalName,
      hospitalCode: newestRecord.hospitalCode,
      licensedModules: [...licensedModulesSet],
      maxUsers,
      expiresAt: soonestExpiry,
      daysRemaining,
      isExpiringSoon: daysRemaining !== null && daysRemaining <= EXPIRY_WARN_DAYS,
      machineFingerprint: newestRecord.machineFingerprint,
      moduleExpiries,
      isInGracePeriod,
      gracePeriodEndsAt,
      gracePeriodModules: [...gracePeriodModulesSet],
      deploymentMode: this.getDeploymentMode(),
      vendorRegistrationRequired: this.isVendorRegistrationRequired(),
    };

    try {
      await this.redis.setex(CACHE_KEYS.LICENSE(cacheTenantKey), CACHE_TTL_SECONDS, JSON.stringify(status));
    } catch (err) {
      this.logger.warn(`Redis setex failed (non-fatal): ${(err as Error).message}`);
    }

    return status;
  }
}
