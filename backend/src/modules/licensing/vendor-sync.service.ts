import {
  Injectable, Logger, BadRequestException, ConflictException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { VendorRegistration } from './entities/vendor-registration.entity';
import { LicenseRequestEntity } from './entities/license-request.entity';
import { LicenseService } from './license.service';
import { RegisterHospitalDto } from './dto/register-hospital.dto';
import { SubmitLicenseRequestDto } from './dto/license-request.dto';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import type { ILicenseProvider } from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER } from '../platform/infrastructure/tokens';

@Injectable()
export class VendorSyncService {
  private readonly logger = new Logger(VendorSyncService.name);

  constructor(
    @InjectRepository(VendorRegistration)
    private readonly regRepo: Repository<VendorRegistration>,
    @InjectRepository(LicenseRequestEntity)
    private readonly reqRepo: Repository<LicenseRequestEntity>,
    private readonly licenseService: LicenseService,

    // Licensing Module Tenant-Scoping Migration, Phase 3 of 6 -- scoped
    // repos for the session-JWT-authenticated paths only. The raw repos
    // above stay exactly as they were for every machine-token-authenticated
    // / natural-key-resolved path (getRegistration(), validateInstanceToken(),
    // verifyWebhookSignature(), notifyPasswordResetRequest(), and
    // internalProvision() -- untouched pending the architectural decision
    // about its role), mirroring CmsDisplayService's findBySlug()-stays-raw
    // pattern.
    @Inject(getTenantScopedRepositoryToken(VendorRegistration))
    private readonly scopedRegRepo: TenantScopedRepository<VendorRegistration>,
    @Inject(getTenantScopedRepositoryToken(LicenseRequestEntity))
    private readonly scopedReqRepo: TenantScopedRepository<LicenseRequestEntity>,
    private readonly tenantContext: TenantContextStorage,
    private readonly config: ConfigService,

    // Bug fix (vendor-request-current-modules, 2026-07-31): `submitRequest()`
    // below used to report "currently has" to the vendor via
    // `LicenseService.getStatus()` -- the same self-hosted-only,
    // NOT-tenant-scoped `license_master` aggregate behind the TokenGateway
    // "Connecting..." bug fixed earlier today. For a cloud tenant that table
    // has nothing to do with the tenant's real entitlements (those live in
    // `subscription_licenses`, read via this `LICENSE_PROVIDER`/
    // `ILicenseProvider` abstraction), so the vendor's "Currently Has"
    // column showed a stale/bloated module list instead of what the tenant
    // is actually licensed for.
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
  ) {}

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * Raw, global, most-recent-row lookup -- unchanged. Used by every
   * machine-token-authenticated / no-session call site (verifyWebhookSignature(),
   * notifyPasswordResetRequest(), internalProvision()), none of which have a
   * JWT/TenantContextInterceptor-established tenant to filter by. For
   * self-hosted (the only confirmed-live user of this whole subsystem
   * today) this is also the only registration row that will ever exist, so
   * "most recent" and "the current tenant's" are identical in practice.
   */
  async getRegistration(): Promise<VendorRegistration | null> {
    return this.regRepo.findOne({ where: {}, order: { registeredAt: 'DESC' } });
  }

  /**
   * Tenant-scoped counterpart of getRegistration(), for the two call sites
   * that run under a real JWT session (register()'s existing-check,
   * LicenseController.getRegistration()'s GET /registration route). For
   * self-hosted, the current tenant is always 'default', so this returns
   * the exact same row getRegistration() would -- zero behavior change.
   * For a cloud deployment with more than one tenant sharing this table,
   * this is the query that actually isolates them.
   */
  async getRegistrationForCurrentTenant(): Promise<VendorRegistration | null> {
    return this.scopedRegRepo.findOne({ order: { registeredAt: 'DESC' }, where: {} });
  }

  async register(dto: RegisterHospitalDto): Promise<VendorRegistration> {
    const existing = await this.getRegistrationForCurrentTenant();
    if (existing) {
      throw new ConflictException('This ZoeConnect instance is already registered with a vendor platform. Contact vendor to re-register.');
    }

    const license = await this.licenseService.getStatus();
    const fingerprint = this.licenseService.getMachineFingerprint();

    const payload = {
      hospitalName:        dto.hospitalName || license.hospitalName || 'Unknown Hospital',
      hospitalCode:        dto.hospitalCode || license.hospitalCode || 'UNKNOWN',
      publicIp:            dto.publicIp,
      publicPort:          dto.publicPort,
      machineFingerprint:  fingerprint,
      webhookUrl:          `http://${dto.publicIp}:${dto.publicPort}/api/v1/license/vendor-webhook`,
    };

    this.logger.log(`Registering with vendor at ${dto.vendorApiUrl}`);

    let responseData: { instanceToken: string; instanceSecret: string } | null = null;
    try {
      const res = await fetch(`${dto.vendorApiUrl}/api/hospitals/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new BadRequestException(`Vendor platform rejected registration: ${err}`);
      }
      responseData = await res.json() as { instanceToken: string; instanceSecret: string };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Could not reach vendor platform at ${dto.vendorApiUrl}: ${err.message}`);
    }

    // Write-path tenant stamping (Stage B, Checkpoint B6 pattern -- same as
    // CmsAuditService.log()): register() always runs under a real JWT
    // session (JwtAuthGuard + PermissionsGuard, no @Public()), so a tenant
    // context is always established here. currentTenantIdOrNull() resolves
    // to 'default''s UUID for every self-hosted install, exactly matching
    // this row's pre-migration (implicit) tenant -- zero behavior change.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const reg = this.regRepo.create({
      instanceToken:      responseData.instanceToken,
      instanceSecret:      responseData.instanceSecret,
      vendorApiUrl:       dto.vendorApiUrl,
      hospitalName:       payload.hospitalName,
      hospitalCode:       payload.hospitalCode,
      publicIp:           dto.publicIp,
      publicPort:         dto.publicPort,
      machineFingerprint: fingerprint,
      status:             'ACTIVE',
      tenantId,
    });

    try {
      return await this.regRepo.save(reg);
    } catch (err: any) {
      // Self-review fix (finding 2): the `existing` check above is
      // check-then-insert, not atomic, so two concurrent register() calls
      // for the SAME tenant can both pass it before either commits. The
      // per-tenant partial unique index
      // (uq_vendor_registrations_single_active_per_tenant,
      // PerTenantLicensingConstraints migration) now catches that race at
      // the DB level (23505 = unique_violation) -- convert it into the
      // same clean ConflictException the sequential check above would
      // have thrown, instead of letting a raw Postgres error surface as an
      // unhandled 500. Self-hosted had this same theoretical race under
      // the pre-migration global singleton index; this fix applies there
      // too, not just to cloud's per-tenant case.
      if (err?.code === '23505') {
        throw new ConflictException('This ZoeConnect instance is already registered with a vendor platform. Contact vendor to re-register.');
      }
      throw err;
    }
  }

  /**
   * Auto-registers a CLOUD tenant with the vendor at its first successful
   * login (called from AuthService.login(), gated there by
   * deployment.mode === 'cloud' -- this method itself has no mode check,
   * so it must never be wired into any self-hosted code path).
   *
   * Why this exists: cloud tenants are created by TenantProvisioningService
   * (Vendor Portal -> POST /platform/tenant-provisioning), which does NOT
   * create a VendorRegistration row -- confirmed by grep, zero references
   * to VendorRegistration/regRepo/vendorSync anywhere in
   * tenant-provisioning/. Without one, every cloud tenant's public login
   * page called the (deliberately global) getRegistration() and saw
   * whichever tenant's row happened to exist first -- the cross-tenant
   * leak fixed in SetupController earlier this session. The real fix for
   * "cloud tenants have no registration at all" is to actually create one,
   * which is what this method does.
   *
   * Unlike register(), there is no external vendor handshake here: the
   * Vendor Portal already knows this tenant exists (it created it), so
   * there's nothing to POST to and no remote instanceToken/instanceSecret
   * to exchange -- both are generated locally, exactly as a self-hosted
   * instance's would be, just without the round-trip.
   *
   * Idempotent and safe to call on every cloud login: if a registration
   * already exists for the current tenant (ambient TenantContextStorage,
   * same convention register() uses), this is a no-op. Must be called
   * inside `TenantContextStorage.run(tenantId, ...)` by the caller so
   * getRegistrationForCurrentTenant() / currentTenantIdOrNull() resolve
   * correctly -- this method has no tenantId parameter of its own,
   * deliberately mirroring register()'s ambient-context pattern rather
   * than introducing a second, parallel way to pass tenant scope through
   * this service.
   */
  async autoRegisterCloudTenant(hospitalName: string, hospitalCode: string): Promise<VendorRegistration | null> {
    const existing = await this.getRegistrationForCurrentTenant();
    if (existing) return existing;

    const fingerprint = this.licenseService.getMachineFingerprint();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const reg = this.regRepo.create({
      instanceToken:      crypto.randomBytes(32).toString('hex'),
      instanceSecret:     crypto.randomBytes(32).toString('hex'),
      // No external vendor URL was ever provided/needed for this path --
      // 'internal://vendor-portal' documents that plainly rather than
      // leaving a blank/misleading value in a NOT NULL varchar column.
      vendorApiUrl:       'internal://vendor-portal',
      hospitalName,
      hospitalCode,
      // No physical on-prem machine to describe for a shared cloud
      // backend -- same placeholder convention internalProvision() uses.
      publicIp:           '0.0.0.0',
      publicPort:         0,
      machineFingerprint: fingerprint,
      status:             'ACTIVE',
      tenantId,
    });

    try {
      return await this.regRepo.save(reg);
    } catch (err: any) {
      // Same class of check-then-insert race register()/internalProvision()
      // already handle -- two concurrent first-logins for the same brand
      // new tenant could both pass the `existing` check above before either
      // commits. The per-tenant partial unique index
      // (uq_vendor_registrations_single_active_per_tenant) catches it at
      // the DB level; resolve idempotently to whichever row won, rather
      // than surfacing an error that would otherwise be swallowed by the
      // caller anyway (this is a non-fatal login side effect).
      if (err?.code === '23505') {
        this.logger.warn(`autoRegisterCloudTenant: concurrent first-login race for ${hospitalCode}, resolved idempotently`);
        return await this.getRegistrationForCurrentTenant();
      }
      throw err;
    }
  }

  async internalProvision(payload: {
    instanceToken: string;
    instanceSecret: string;
    vendorApiUrl: string;
    hospitalName: string;
    hospitalCode: string;
  }): Promise<VendorRegistration> {
    const existing = await this.getRegistration();
    if (existing) {
      if (existing.instanceToken === payload.instanceToken && existing.hospitalCode === payload.hospitalCode) {
        this.logger.log(`Instance already provisioned with identical token for ${payload.hospitalCode} (idempotent success)`);
        return existing;
      }
      throw new ConflictException('Instance is already registered or provisioned with different credentials.');
    }

    const fingerprint = this.licenseService.getMachineFingerprint();

    const reg = this.regRepo.create({
      instanceToken:      payload.instanceToken,
      instanceSecret:     payload.instanceSecret,
      vendorApiUrl:       payload.vendorApiUrl,
      hospitalName:       payload.hospitalName,
      hospitalCode:       payload.hospitalCode,
      publicIp:           '0.0.0.0', // Not used/needed in cloud environments typically
      publicPort:         0,
      machineFingerprint: fingerprint,
      status:             'ACTIVE',
    });

    try {
      const saved = await this.regRepo.save(reg);
      this.logger.log(`Internal provisioning complete for ${payload.hospitalCode}`);
      return saved;
    } catch (err: any) {
      // Concurrent-duplicate-request race: the sequential `existing` check
      // above is check-then-insert, not atomic, so two simultaneous calls
      // can both pass it before either commits. Postgres' unique constraint
      // on instance_token (uq_instance_token, CreateVendorSyncSchema
      // migration) and the singleton-active partial index added by
      // VendorRegistrationSingletonEnforcement now catch that at the DB
      // level (error code 23505 = unique_violation) — this re-resolves the
      // outcome the same way the sequential check above would have, instead
      // of surfacing a raw 500 for what is, from the caller's perspective,
      // simply "already provisioned".
      if (err?.code === '23505') {
        const raceWinner = await this.getRegistration();
        if (raceWinner && raceWinner.instanceToken === payload.instanceToken && raceWinner.hospitalCode === payload.hospitalCode) {
          this.logger.warn(`internalProvision: concurrent duplicate request for ${payload.hospitalCode} resolved idempotently`);
          return raceWinner;
        }
        throw new ConflictException('Instance is already registered or provisioned with different credentials.');
      }
      throw err;
    }
  }

  // ── License Requests ───────────────────────────────────────────────────────

  // submitRequest() runs under a real JWT session (JwtAuthGuard +
  // PermissionsGuard) -- both lookups below are scoped to the current
  // tenant, matching register()'s reasoning exactly. Self-hosted:
  // identical result to the pre-migration global lookup, since 'default'
  // is the only tenant that will ever exist.
  async submitRequest(dto: SubmitLicenseRequestDto): Promise<LicenseRequestEntity> {
    const reg = await this.scopedRegRepo.findOne({ where: { status: 'ACTIVE' } });
    if (!reg) {
      throw new BadRequestException('Not registered with vendor. Complete registration first.');
    }

    // Check for an already-pending request
    const pending = await this.scopedReqRepo.findOne({ where: { status: 'PENDING' } });
    if (pending) {
      throw new ConflictException('A license request is already pending vendor review.');
    }

    // Write-path tenant stamping, resolved here (rather than only just
    // before the entity save further below) so the license lookup right
    // after can use it too -- see this constructor's `licenseProvider` doc
    // comment for why this replaced `LicenseService.getStatus()`.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const license = await this.licenseProvider.getStatus(tenantId ?? undefined);

    const vendorPayload = {
      instanceToken:       reg.instanceToken,
      requestedModules:    dto.requestedModules,
      remarks:             dto.remarks ?? null,
      hospitalName:        reg.hospitalName,
      hospitalCode:        reg.hospitalCode,
      machineFingerprint:  reg.machineFingerprint,
      currentModules:      license.licensedModules,
      isTrial:             license.isTrial,
      expiresAt:           license.expiresAt,
    };

    // Allow Cloud Tenants to Submit License Requests -- a cloud tenant's
    // VendorRegistration.vendorApiUrl is the internal 'internal://vendor-portal'
    // placeholder (see autoRegisterCloudTenant()'s doc comment: there's no
    // external vendor handshake at first-login time, since the Vendor
    // Portal already created this tenant). That placeholder used to mean
    // "mock the response, there's nothing real to call" -- but the Vendor
    // Portal's own `/api/requests` endpoint DOES exist and is reachable at
    // `VENDOR_PORTAL_URL`; the only reason this wasn't already wired up is
    // that `reg.instanceToken` (generated locally by stepIssueTrialLicense()
    // during provisioning) previously never reached the Vendor Portal's own
    // `cloud_tenants` table, so even a real call would have failed with
    // "unknown instance token." Now that provisioning hands the same
    // instanceToken back to Vendor Portal (see buildProvisioningSummary()
    // and CloudTenantsService.provision()), this can be a real call like
    // any self-hosted registration's.
    const targetUrl = this.resolveVendorBaseUrl(reg);

    let vendorRequestId: string | null = null;
    if (reg.vendorApiUrl === 'internal://vendor-portal' && !targetUrl) {
      // Not configured at all (e.g. a dev environment that hasn't set
      // VENDOR_PORTAL_URL yet) -- fall back to the previous mocked behavior
      // rather than hard-failing every cloud tenant's license request.
      this.logger.warn('submitRequest(): VENDOR_PORTAL_URL is not configured; mocking vendorRequestId instead of contacting the Vendor Portal.');
      vendorRequestId = crypto.randomUUID();
    } else {
      try {
        const res = await fetch(`${targetUrl}/api/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Instance-Token': reg.instanceToken,
          },
          body: JSON.stringify(vendorPayload),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new BadRequestException(`Vendor platform rejected the request: ${err}`);
        }
        const body = await res.json() as { requestId: string };
        vendorRequestId = body.requestId;
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(`Could not reach vendor platform: ${err.message}`);
      }
    }

    // Write-path tenant stamping -- same reasoning as register() above.
    // (`tenantId` already resolved further up, before the license lookup.)
    const entity = this.reqRepo.create({
      vendorRequestId,
      requestedModules: dto.requestedModules,
      remarks:          dto.remarks ?? null,
      status:           'PENDING',
      tenantId,
    });

    try {
      return await this.reqRepo.save(entity);
    } catch (err: any) {
      // Self-review fix (finding 2): the "already-pending?" check above is
      // check-then-insert, not atomic, so two concurrent submitRequest()
      // calls for the SAME tenant can both pass it before either commits.
      // The new per-tenant partial unique index
      // (uq_license_requests_single_pending_per_tenant,
      // PerTenantLicensingConstraints migration) now catches that race at
      // the DB level (23505 = unique_violation) -- convert it into the
      // same clean ConflictException the sequential check above would
      // have thrown, instead of letting a raw Postgres error surface as an
      // unhandled 500. This constraint is new (no prior global version),
      // so this also newly protects self-hosted's identical single-tenant
      // race, which previously had no DB-level backing at all.
      if (err?.code === '23505') {
        throw new ConflictException('A license request is already pending vendor review.');
      }
      throw err;
    }
  }

  async listRequests(): Promise<LicenseRequestEntity[]> {
    return this.scopedReqRepo.find({ order: { submittedAt: 'DESC' } });
  }

  /**
   * Lets a hospital admin withdraw their own still-pending license request
   * instead of waiting for the vendor to act on it. Only a PENDING request
   * can be cancelled -- once the vendor has already approved/rejected it,
   * there is nothing left to withdraw. Cancelling frees the same per-tenant
   * "one pending request" slot (`uq_license_requests_single_pending_per_tenant`,
   * PerTenantLicensingConstraints migration) that blocked submitRequest()
   * from accepting a new/corrected request while the old one was still
   * outstanding.
   *
   * This only updates ZoeConnect's own local record. The vendor may still
   * have an independent PENDING copy of the same request in their own
   * queue (Vendor Portal has no cancel-notification endpoint today) -- see
   * markRequestResolved() below for how a late vendor decision on an
   * already-cancelled request is handled so it can't silently resurrect it.
   */
  async cancelRequest(id: string): Promise<LicenseRequestEntity> {
    const req = await this.scopedReqRepo.findOne({ where: { id } });
    if (!req) {
      throw new BadRequestException('License request not found.');
    }
    if (req.status !== 'PENDING') {
      throw new ConflictException(`Only a pending request can be cancelled (this one is ${req.status}).`);
    }
    req.status = 'CANCELLED';
    req.resolvedAt = new Date();
    return this.reqRepo.save(req);
  }

  /** Unused by any current caller -- left on the raw repo rather than
   *  touched speculatively; convert alongside its first real caller. */
  async getLatestRequest(): Promise<LicenseRequestEntity | null> {
    return this.reqRepo.findOne({ order: { submittedAt: 'DESC' }, where: {} });
  }

  // ── Called by LicenseController.vendorWebhook() ─────────────────────────
  // Both methods below are only ever reached from the vendor-webhook route,
  // which is @Public() (no JWT) -- Licensing Module Tenant-Scoping
  // Migration, Phase 4 establishes TenantContextStorage.run(reg.tenantId, ...)
  // around the whole webhook handler body once the registration row is
  // resolved by HMAC signature, so by the time these run, tenant context is
  // already correctly established and these scoped-repo calls resolve the
  // same way the pre-migration global lookup did for self-hosted.

  async markRequestResolved(
    vendorRequestId: string,
    status: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
  ): Promise<void> {
    const req = await this.scopedReqRepo.findOne({ where: { vendorRequestId } });
    if (!req) return;
    // The hospital withdrew this request locally (cancelRequest()) after
    // the vendor had already started reviewing it -- the vendor's own copy
    // has no cancel-notification today, so a late approve/reject webhook
    // can still arrive here for a request ZoeConnect no longer considers
    // outstanding. Don't let it overwrite the withdrawal; log it instead so
    // there's a trace of the vendor acting on a request the hospital
    // already cancelled.
    if (req.status === 'CANCELLED') {
      this.logger.warn(`markRequestResolved: vendor resolved request ${vendorRequestId} as ${status}, but it was already cancelled locally -- ignoring.`);
      return;
    }
    req.status = status;
    req.resolvedAt = new Date();
    if (rejectionReason) req.rejectionReason = rejectionReason;
    await this.reqRepo.save(req);
  }

  async markAllRequestsRevoked(): Promise<void> {
    // TenantScopedRepository.update(criteria, partialEntity) is the class's
    // own blessed write-scoping shape for exactly this case (a plain
    // criteria object, no joins/raw SQL needed) -- used instead of
    // createQueryBuilder().update() to avoid relying on an unofficial
    // combination of that class's read-oriented createQueryBuilder() with
    // TypeORM's separate update-builder API.
    await this.scopedReqRepo.update({ status: 'APPROVED' }, { status: 'REVOKED', resolvedAt: new Date() });
  }

  // â”€â”€ Instance token validation (used by config-export endpoint) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async validateInstanceToken(token: string): Promise<boolean> {
    const reg = await this.regRepo.findOne({ where: { instanceToken: token, status: 'ACTIVE' } });
    return !!reg;
  }

  // â”€â”€ Webhook signature verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): Promise<boolean> {
    const reg = await this.getRegistration();
    return this.checkWebhookSignature(reg, rawBody, signatureHeader);
  }

  /**
   * Licensing Module Tenant-Scoping Migration, Phase 4 of 6 -- same
   * verification as verifyWebhookSignature() (kept unchanged above, still
   * boolean, for its existing caller/tests), but returns the matched
   * registration row on success instead of just `true`. LicenseController.
   * vendorWebhook() uses this so it can establish tenant context (`reg.tenantId`)
   * around the rest of the handler before any scoped-repo call inside
   * markRequestResolved()/markAllRequestsRevoked()/uploadLicense() runs --
   * those would otherwise throw "no tenant context established" when
   * reached from this @Public() route (no JWT, no TenantContextInterceptor).
   */
  async resolveVerifiedWebhookRegistration(rawBody: Buffer, signatureHeader: string): Promise<VendorRegistration | null> {
    const reg = await this.getRegistration();
    const valid = await this.checkWebhookSignature(reg, rawBody, signatureHeader);
    return valid ? reg : null;
  }

  private async checkWebhookSignature(
    reg: VendorRegistration | null,
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<boolean> {
    if (!reg) return false;
    if (!signatureHeader) return false;

    const expected = `sha256=${crypto
      .createHmac('sha256', reg.instanceSecret)
      .update(rawBody)
      .digest('hex')}`;

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(signatureHeader);
    // Length check before timingSafeEqual -- it throws a RangeError on
    // mismatched buffer lengths rather than returning false. An attacker
    // (or just a malformed/truncated header) sending a signature of the
    // wrong length would previously crash this call with an unhandled
    // exception instead of being cleanly rejected. Same guard already used
    // by VendorPortalApiKeyGuard.isValidKey() for the same reason.
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
  /**
   * Resolves the real HTTP base URL to send a vendor-bound request to, for
   * any VendorRegistration -- whether it holds a genuine external vendor
   * URL (self-hosted's register() always stores one) or the internal
   * 'internal://vendor-portal' marker a cloud/hybrid tenant's registration
   * carries (see autoRegisterCloudTenant()'s doc comment: there's no
   * external handshake at first login, since the Vendor Portal already
   * created the tenant).
   *
   * Every outbound vendor call site should resolve through here rather
   * than special-casing the marker itself inline -- that was the shape of
   * the bug this fixes: notifyPasswordResetRequest() used to treat the
   * marker as "there's nothing to call, skip the webhook entirely" instead
   * of "resolve it to the Vendor Portal's own internal base URL and make
   * the exact same call." Reusing this one resolver keeps cloud, hybrid,
   * and self-hosted on one consistent code path -- they end up making the
   * identical HTTP call, just to a different base URL, rather than cloud
   * silently no-op'ing or a second call site re-implementing its own
   * bespoke resolution logic (submitRequest() above previously had its own
   * inline version of this same idea; it now goes through here too).
   *
   * VENDOR_PORTAL_URL (deployment.vendorPortalUrl) is reused rather than a
   * second, separately-named env var for the same value -- submitRequest()
   * already established this as "the internal Vendor Portal's own base
   * URL" before this method existed.
   */
  private resolveVendorBaseUrl(reg: VendorRegistration): string | null {
    if (reg.vendorApiUrl !== 'internal://vendor-portal') {
      return reg.vendorApiUrl;
    }
    return this.config.get<string>('deployment.vendorPortalUrl', '') || null;
  }

  async notifyPasswordResetRequest(payload: any): Promise<void> {
    const reg = await this.getRegistration();
    if (!reg) {
      this.logger.warn('notifyPasswordResetRequest: No vendor registration found, aborting.');
      return;
    }

    const baseUrl = this.resolveVendorBaseUrl(reg);
    if (!baseUrl) {
      // Only reachable for the internal marker with VENDOR_PORTAL_URL left
      // unconfigured (e.g. a dev environment) -- same defensive fallback
      // submitRequest() applies rather than throwing, since this is a
      // non-fatal side effect of forgotPassword(), not something that
      // should surface to the unauthenticated caller.
      this.logger.warn(
        'notifyPasswordResetRequest: Internal vendor portal marker present but VENDOR_PORTAL_URL is not configured; cannot deliver webhook.',
      );
      return;
    }

    // From here on, cloud/hybrid (internal marker, resolved to
    // VENDOR_PORTAL_URL) and self-hosted (its own real vendorApiUrl) make
    // exactly the same call -- same HMAC signing, same headers, same
    // timeout, same error handling. No branch on deployment mode below.
    const fullUrl = `${baseUrl}/api/hospitals/forgot-password`;
    this.logger.log(`notifyPasswordResetRequest: Sending webhook to ${fullUrl}`);
    const timestamp = Date.now().toString();
    const bodyString = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', reg.instanceSecret).update(bodyString + timestamp).digest('hex');
    try {
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Instance-Token': reg.instanceToken,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
        body: bodyString,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Vendor rejected password reset request: ${text}`);
      } else {
        this.logger.log(`notifyPasswordResetRequest: Webhook successfully delivered to vendor.`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to notify vendor of password reset: ${err.message}`);
    }
  }
}


