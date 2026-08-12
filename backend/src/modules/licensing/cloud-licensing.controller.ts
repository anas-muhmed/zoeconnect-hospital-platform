import {
  Controller, Put, Post, Param, Body, UseGuards, Logger, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SubscriptionLicense } from './entities/subscription-license.entity';
import { LicenseRequestEntity } from './entities/license-request.entity';
import { UpdateSubscriptionLicenseDto } from './dto/update-subscription-license.dto';
import { RejectCloudRequestDto } from './dto/reject-cloud-request.dto';
import { CloudLicensingHmacGuard } from './guards/cloud-licensing-hmac.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuditService } from '../audit/audit.service';
import { isValidTransition } from './utils/subscription-status-transition.util';

/**
 * Cloud Licensing API (architecture review, 2026-07-29).
 *
 * Replaces the RSA-signed-file / webhook flow for CLOUD tenants only --
 * Vendor Portal and ZoeConnect Cloud are the same trust domain, so
 * entitlements are updated with a direct, authenticated database write
 * instead of a signed artifact:
 *
 *   Vendor Portal -> Cloud Licensing API (this controller, HMAC-authenticated)
 *   -> subscription_licenses row -> LicenseGuard reads it on the very next
 *   request via SubscriptionLicenseProvider (no cache in that read path --
 *   see that provider's doc comment) -- no activation step, no webhook, no
 *   restart.
 *
 * Self-hosted is completely untouched: this controller only ever writes
 * `subscription_licenses`, which `FileLicenseProvider`/`LicenseService`
 * never read.
 *
 * `@Public()` -- this is a service-to-service route (Vendor Portal calling
 * ZoeConnect Cloud directly), not a JWT-authenticated user session.
 * `CloudLicensingHmacGuard` is the real gate, reusing the same
 * HMAC-over-`VendorRegistration.instanceSecret` verification the inbound
 * self-hosted vendor-webhook path already uses.
 */
@ApiTags('Cloud Licensing')
@Controller('platform/licensing/tenants')
export class CloudLicensingController {
  private readonly logger = new Logger(CloudLicensingController.name);

  constructor(
    @InjectRepository(SubscriptionLicense)
    private readonly subscriptionRepo: Repository<SubscriptionLicense>,
    // Bug fix (cloud-request-resolution, 2026-07-31): plain (not
    // tenant-context-scoped) repository, matching this controller's existing
    // pattern for `subscriptionRepo` above -- this is a @Public(),
    // multi-tenant, HMAC-authenticated route with no ambient tenant context
    // to rely on, so every query explicitly filters by the `:tenantId` path
    // param instead. `LicenseRequestEntity.tenantId` is reliably populated
    // at write time (`VendorSyncService.submitRequest()` stamps it via
    // `tenantContext.currentTenantIdOrNull()`), so filtering on it directly
    // here is safe.
    @InjectRepository(LicenseRequestEntity)
    private readonly licenseRequestRepo: Repository<LicenseRequestEntity>,
    private readonly auditService: AuditService,
  ) {}

  // Registered Tenants trial/licensing column (2026-08-03) -- read
  // counterpart of `updateSubscription()` below. Vendor Portal previously
  // had no way at all to read a cloud tenant's live subscription_licenses
  // row back (only ever PUT to it), so tenants provisioned straight into a
  // trial by tenant-provisioning's issue_trial_license step -- never routed
  // through Vendor Portal's own approve/extend-trial flow -- had no
  // Vendor-Portal-visible trial status or expiry at all.
  //
  // POST rather than GET, deliberately -- matching
  // CvCloudProviderConfigController.getProvider()'s own doc comment: every
  // other CloudLicensingHmacGuard route in this codebase is POST/PUT with a
  // real signed body, and there's no precedent for a GET's raw (empty) body
  // flowing through Fastify's rawBody capture + this guard's HMAC check.
  // This "query" is a POST with an empty JSON body ("{}") to stay on the
  // exact same tested path instead of being the first to rely on that.
  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Post(':tenantId/subscription/query')
  @ApiOperation({ summary: 'Read a cloud tenant\'s current subscription entitlements (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)' })
  @ApiHeader({ name: 'X-Vendor-Signature', description: 'sha256=<hmac> over the raw request body ("{}"), keyed by this tenant\'s VendorRegistration.instanceSecret' })
  async getSubscription(
    @Param('tenantId') tenantId: string,
  ): Promise<{
    ok: true;
    found: boolean;
    subscriptionStatus?: string;
    licensedModules?: string[];
    planId?: string | null;
    maxUsers?: number;
    currentPeriodEnd?: string | null;
  }> {
    const existing = await this.subscriptionRepo.findOne({ where: { tenantId }, order: { updatedAt: 'DESC' } });
    if (!existing) {
      return { ok: true, found: false };
    }
    return {
      ok: true,
      found: true,
      subscriptionStatus: existing.subscriptionStatus,
      licensedModules: existing.licensedModules,
      planId: existing.planId,
      maxUsers: existing.maxUsers,
      currentPeriodEnd: existing.currentPeriodEnd ? existing.currentPeriodEnd.toISOString() : null,
    };
  }

  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Put(':tenantId/subscription')
  @ApiOperation({ summary: 'Upsert a cloud tenant\'s subscription entitlements (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)' })
  @ApiHeader({ name: 'X-Vendor-Signature', description: 'sha256=<hmac> over the raw request body, keyed by this tenant\'s VendorRegistration.instanceSecret' })
  async updateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateSubscriptionLicenseDto,
  ): Promise<{ ok: true; id: string; subscriptionStatus: string; noop?: true }> {
    const existing = await this.subscriptionRepo.findOne({ where: { tenantId }, order: { updatedAt: 'DESC' } });
    const oldValue = existing
      ? {
          subscriptionStatus: existing.subscriptionStatus,
          licensedModules: existing.licensedModules,
          planId: existing.planId,
          maxUsers: existing.maxUsers,
          currentPeriodEnd: existing.currentPeriodEnd,
        }
      : null;

    // State-machine hardening (2026-07-29): reject transitions that don't
    // make sense (e.g. "canceled" -> "trialing") instead of silently
    // accepting any string the caller sends. Same-status "transitions" are
    // always allowed -- a retried request (see idempotency note below) must
    // never be rejected as "invalid."
    const transitionCheck = isValidTransition(existing?.subscriptionStatus, dto.subscriptionStatus);
    if (!transitionCheck.ok) {
      await this.auditService.log({
        action: 'SUBSCRIPTION_LICENSE_TRANSITION_REJECTED',
        module: 'LICENSING',
        entityType: 'subscription_license',
        entityId: existing?.id,
        oldValue: oldValue as unknown as Record<string, unknown> | undefined,
        metadata: {
          attemptedStatus: dto.subscriptionStatus,
          changedBy: dto.changedBy ?? 'unknown',
          reason: dto.reason ?? 'other',
          rejectionReason: transitionCheck.reason,
        },
      });
      throw new ConflictException(transitionCheck.reason);
    }

    // License-module-merge fix (2026-07-31): resolve what `licensedModules`
    // should actually become before it's ever compared (idempotency check)
    // or written (create/patch below) -- see `modulesOp`'s doc comment on
    // `UpdateSubscriptionLicenseDto`. `'add'` unions the incoming modules
    // into whatever's already on the row; anything else (including a brand
    // new row, which has nothing to union against) is an unchanged full
    // replace.
    const resolvedLicensedModules =
      dto.modulesOp === 'add' && existing
        ? Array.from(new Set([...(existing.licensedModules ?? []), ...dto.licensedModules]))
        : dto.licensedModules;

    // Bug fix (license-expiry-clear, 2026-07-31): `dto.currentPeriodEnd` is
    // now three-way -- `undefined` (field omitted) means "leave whatever's
    // already on the row alone," explicit `null` means "clear it" (a
    // PERPETUAL approval has no expiry), and a string means "set it to
    // this." Resolve it once, up front, so the idempotency check below and
    // the actual write agree on the exact same value -- this used to be a
    // bare `new Date(dto.currentPeriodEnd)` with no null-handling at all,
    // which for a brand-new row's `null` would have produced `new
    // Date(null)` (the Unix epoch), not "no expiry."
    const resolvedCurrentPeriodEnd: Date | null =
      dto.currentPeriodEnd === undefined
        ? (existing?.currentPeriodEnd ?? null)
        : (dto.currentPeriodEnd === null ? null : new Date(dto.currentPeriodEnd));

    if (!existing) {
      // Defensive only -- tenant-provisioning's issue_trial_license step
      // already creates this row for every cloud tenant. Create rather
      // than 404 so a manual/out-of-band entitlement push can never be
      // blocked by a missing row it's perfectly capable of creating.
      this.logger.warn(`No subscription_licenses row found for tenant=${tenantId}; creating one`);
      const created = this.subscriptionRepo.create({
        tenantId,
        hospitalName: '',
        hospitalCode: '',
        subscriptionStatus: dto.subscriptionStatus,
        licensedModules: resolvedLicensedModules,
        planId: dto.planId ?? null,
        maxUsers: dto.maxUsers ?? 5,
        currentPeriodEnd: resolvedCurrentPeriodEnd,
        stripeCustomerId: dto.stripeCustomerId ?? null,
        stripeSubscriptionId: dto.stripeSubscriptionId ?? null,
      });
      const saved = await this.subscriptionRepo.save(created);
      await this.logChange(saved.id, oldValue, saved, dto);
      await this.resolvePendingRequestIfAny(tenantId, dto);
      return { ok: true, id: saved.id, subscriptionStatus: saved.subscriptionStatus };
    }

    // Idempotency / no-op short-circuit: if a retried request (e.g. Vendor
    // Portal timed out and re-sent the same PUT) describes exactly the state
    // that's already persisted, skip the write and the audit entry entirely
    // -- a retry must have no side effects beyond confirming the current
    // state, not create duplicate audit noise or unnecessary writes.
    const noopCandidate = {
      subscriptionStatus: dto.subscriptionStatus,
      licensedModules: resolvedLicensedModules,
      planId: dto.planId ?? existing.planId,
      maxUsers: dto.maxUsers ?? existing.maxUsers,
      currentPeriodEnd: resolvedCurrentPeriodEnd?.toISOString() ?? null,
    };
    const currentAsComparable = {
      subscriptionStatus: existing.subscriptionStatus,
      licensedModules: existing.licensedModules,
      planId: existing.planId,
      maxUsers: existing.maxUsers,
      currentPeriodEnd: existing.currentPeriodEnd?.toISOString() ?? null,
    };
    if (JSON.stringify(noopCandidate) === JSON.stringify(currentAsComparable)
      && dto.stripeCustomerId === undefined && dto.stripeSubscriptionId === undefined) {
      this.logger.log(`Subscription update for tenant=${tenantId} is a no-op (identical state) -- skipping write, likely a retry.`);
      // Still resolve the pending request even on a no-op write -- a retried
      // approval PUT (e.g. Vendor Portal's original call timed out but
      // actually landed) must still clear "Pending Review" on the retry, not
      // just on whichever attempt happened to win the write.
      await this.resolvePendingRequestIfAny(tenantId, dto);
      return { ok: true, id: existing.id, subscriptionStatus: existing.subscriptionStatus, noop: true };
    }

    // Concurrency hardening (2026-07-29): a targeted, atomic column-level
    // UPDATE by primary key -- NOT a read-modify-write full-entity `.save()`
    // of the row we read a moment ago. This matters because two updates can
    // legitimately race (a billing renewal setting currentPeriodEnd, and an
    // admin changing licensedModules, arriving almost simultaneously): each
    // request's UPDATE only SETs the columns IT was actually asked to
    // change, so neither can clobber a field the other just wrote that this
    // request never touched. `subscriptionStatus`/`licensedModules` are
    // required by the DTO and therefore always included -- if two requests
    // both explicitly set the SAME field, last-write-wins is the correct,
    // expected outcome (both intended to set it), which is different from
    // the bug this guards against (unintentionally overwriting UNRELATED
    // fields due to a stale read).
    const patch: Partial<SubscriptionLicense> = {
      subscriptionStatus: dto.subscriptionStatus,
      licensedModules: resolvedLicensedModules,
    };
    if (dto.planId !== undefined) patch.planId = dto.planId;
    if (dto.maxUsers !== undefined) patch.maxUsers = dto.maxUsers;
    if (dto.currentPeriodEnd !== undefined) patch.currentPeriodEnd = resolvedCurrentPeriodEnd;
    if (dto.stripeCustomerId !== undefined) patch.stripeCustomerId = dto.stripeCustomerId;
    if (dto.stripeSubscriptionId !== undefined) patch.stripeSubscriptionId = dto.stripeSubscriptionId;

    await this.subscriptionRepo.update(existing.id, patch as unknown as Parameters<typeof this.subscriptionRepo.update>[1]);
    const saved = await this.subscriptionRepo.findOneOrFail({ where: { id: existing.id } });

    // No cache to invalidate -- SubscriptionLicenseProvider reads
    // subscription_licenses directly on every getStatus() call (unlike
    // LicenseService's Redis-cached self-hosted path), so this write takes
    // effect on the very next request, exactly as the architecture review
    // requires ("No activation. No webhook. No restart.").

    await this.logChange(saved.id, oldValue, saved, dto);

    this.logger.log(`Subscription license updated via Cloud Licensing API: tenant=${tenantId} status=${saved.subscriptionStatus} changedBy=${dto.changedBy ?? 'unknown'} reason=${dto.reason ?? 'other'}`);

    await this.resolvePendingRequestIfAny(tenantId, dto);

    return { ok: true, id: saved.id, subscriptionStatus: saved.subscriptionStatus };
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  //
  // Bug fix (cloud-request-resolution, 2026-07-31): the reject-side
  // counterpart to `updateSubscription()`'s `vendorRequestId` handling above.
  // A rejection has no entitlement to push (nothing was granted), so it
  // doesn't go through `updateSubscription()` at all -- this is Vendor
  // Portal's `HospitalsService.rejectRequest()` calling straight in for
  // cloud tenants, where self-hosted's `REQUEST_REJECTED` webhook has no
  // delivery target (a cloud `Hospital` row has no `webhookUrl`/
  // `instanceSecret`, so `WebhookService.deliver()` silently no-ops for it).
  // Same HMAC guard, same `:tenantId` trust boundary as `updateSubscription()`.
  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Put(':tenantId/requests/:vendorRequestId/reject')
  @ApiOperation({ summary: "Mark a cloud tenant's own pending license_requests row REJECTED (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)" })
  @ApiHeader({ name: 'X-Vendor-Signature', description: 'sha256=<hmac> over the raw request body, keyed by this tenant\'s VendorRegistration.instanceSecret' })
  async rejectRequest(
    @Param('tenantId') tenantId: string,
    @Param('vendorRequestId') vendorRequestId: string,
    @Body() dto: RejectCloudRequestDto,
  ): Promise<{ ok: true; resolved: boolean }> {
    const request = await this.licenseRequestRepo.findOne({ where: { tenantId, vendorRequestId } });
    if (!request) {
      this.logger.warn(`rejectRequest: no license_requests row found for tenant=${tenantId} vendorRequestId=${vendorRequestId}`);
      return { ok: true, resolved: false };
    }
    if (request.status !== 'PENDING') {
      // Already resolved, or the hospital cancelled it locally -- same guard
      // `resolvePendingRequestIfAny()`/`VendorSyncService.markRequestResolved()`
      // apply, don't overwrite either.
      return { ok: true, resolved: false };
    }

    request.status = 'REJECTED';
    request.resolvedAt = new Date();
    if (dto.reason) request.rejectionReason = dto.reason;
    await this.licenseRequestRepo.save(request);

    await this.auditService.log({
      action: 'LICENSE_REQUEST_REJECTED',
      module: 'LICENSING',
      entityType: 'license_request',
      entityId: request.id,
      newValue: { status: 'REJECTED', rejectionReason: dto.reason ?? null } as unknown as Record<string, unknown>,
      metadata: { changedBy: dto.rejectedBy ?? 'unknown' },
    });

    this.logger.log(`License request rejected via Cloud Licensing API: tenant=${tenantId} vendorRequestId=${vendorRequestId}`);

    return { ok: true, resolved: true };
  }

  /**
   * Bug fix (cloud-request-resolution, 2026-07-31): resolves the tenant's
   * own `license_requests` row (backing "License Request History" on the
   * tenant's Settings > License page) to APPROVED as a side effect of this
   * entitlement push, when the caller identifies which request it's
   * resolving via `dto.vendorRequestId`. Mirrors
   * `VendorSyncService.markRequestResolved()` (the self-hosted webhook
   * path's equivalent) -- same "only touch it if still PENDING, don't
   * clobber a hospital-side cancellation" guard -- but as a standalone,
   * plain-repository query filtered by `tenantId` rather than going through
   * `TenantScopedRepository`/ambient tenant context, since this route has
   * neither (see the constructor's doc comment on `licenseRequestRepo`).
   *
   * A no-op (nothing found/updated) if `vendorRequestId` wasn't passed --
   * every caller that isn't resolving a specific request (a bare
   * out-of-band entitlement push, an admin override, etc.) is unaffected.
   */
  private async resolvePendingRequestIfAny(tenantId: string, dto: UpdateSubscriptionLicenseDto): Promise<void> {
    if (!dto.vendorRequestId) return;

    const request = await this.licenseRequestRepo.findOne({
      where: { tenantId, vendorRequestId: dto.vendorRequestId },
    });
    if (!request) {
      this.logger.warn(`resolvePendingRequestIfAny: no license_requests row found for tenant=${tenantId} vendorRequestId=${dto.vendorRequestId}`);
      return;
    }
    if (request.status !== 'PENDING') {
      // Already resolved (a prior attempt got there first) or the hospital
      // cancelled it locally in the meantime -- don't overwrite either.
      return;
    }

    request.status = 'APPROVED';
    request.resolvedAt = new Date();
    await this.licenseRequestRepo.save(request);
    this.logger.log(`License request resolved via Cloud Licensing API: tenant=${tenantId} vendorRequestId=${dto.vendorRequestId} status=APPROVED`);
  }

  /** Shared audit-log write for both the create-on-missing-row path and the normal update path -- "who/when/previous/new/reason" per the architecture review. */
  private async logChange(
    entityId: string,
    oldValue: Record<string, unknown> | null,
    saved: SubscriptionLicense,
    dto: UpdateSubscriptionLicenseDto,
  ): Promise<void> {
    await this.auditService.log({
      action: 'SUBSCRIPTION_LICENSE_UPDATED',
      module: 'LICENSING',
      entityType: 'subscription_license',
      entityId,
      oldValue: oldValue as unknown as Record<string, unknown> | undefined,
      newValue: {
        subscriptionStatus: saved.subscriptionStatus,
        licensedModules: saved.licensedModules,
        planId: saved.planId,
        maxUsers: saved.maxUsers,
        currentPeriodEnd: saved.currentPeriodEnd,
      } as unknown as Record<string, unknown>,
      metadata: {
        changedBy: dto.changedBy ?? 'unknown',
        reason: dto.reason ?? 'other',
      },
    });
  }
}
