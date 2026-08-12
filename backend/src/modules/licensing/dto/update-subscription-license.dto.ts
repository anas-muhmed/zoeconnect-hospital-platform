import {
  IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min, ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../entities/subscription-license.entity';

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'suspended'];

/**
 * Free-text-but-constrained reason codes for the audit trail (hardening
 * pass, 2026-07-29) -- "who changed it, when, previous/new values, reason"
 * per the architecture review. `other` exists as an escape hatch so this
 * never blocks a legitimate call whose motive doesn't fit the common cases.
 */
export const SUBSCRIPTION_CHANGE_REASONS = [
  'trial_start', 'upgrade', 'downgrade', 'renewal', 'suspension', 'reactivation', 'cancellation', 'admin_override', 'other',
] as const;
export type SubscriptionChangeReason = typeof SUBSCRIPTION_CHANGE_REASONS[number];

/**
 * Body shape for `PUT /platform/licensing/tenants/:tenantId/subscription`
 * (Cloud Licensing API, 2026-07-29). Vendor Portal -> Cloud Licensing API is
 * the SAME trust domain call the architecture review describes -- "a
 * direct, authenticated database-entitlement update," not a signed license
 * file. See CloudLicensingController's doc comment for the full picture.
 *
 * `stripeCustomerId`/`stripeSubscriptionId` are accepted/stored only --
 * no Stripe integration exists yet (explicitly out of scope, "administrator
 * -managed entitlements now, real billing later").
 */
export class UpdateSubscriptionLicenseDto {
  @ApiProperty({ enum: SUBSCRIPTION_STATUSES })
  @IsString() @IsIn(SUBSCRIPTION_STATUSES)
  subscriptionStatus: SubscriptionStatus;

  @ApiProperty({ type: [String], example: ['PLATFORM', 'LOYALTY'] })
  @IsArray() @IsString({ each: true })
  licensedModules: string[];

  /**
   * Bug fix (license-module-merge, 2026-07-31): this single cloud
   * `subscription_licenses` row has no equivalent of self-hosted's
   * multi-record accumulation (`LicenseService.refreshCache()` unions
   * `licensedModules` across every ACTIVE `LicenseRecord`) -- there's only
   * ever one row per tenant here, so a plain overwrite of `licensedModules`
   * silently drops whatever was already licensed. That's exactly what was
   * happening: Vendor Portal's approval flow intentionally sends only the
   * NEWLY-approved delta module set (see
   * `vendor-portal/frontend/.../requests/[id]/page.tsx`'s "each approval is
   * a delta license" comment, which holds for self-hosted but not here),
   * and Vendor Portal has no way to read this row's current state first to
   * compute a full replacement itself (no GET counterpart to this PUT
   * exists) -- so the merge has to happen here, server-side, where the
   * current row is already loaded.
   *
   * - `'add'` (Vendor Portal's add-on-module approval flow): union
   *   `licensedModules` into whatever's already on the row instead of
   *   replacing it.
   * - `'replace'` (default, and every existing/future caller that doesn't
   *   set this): unchanged behaviour -- `licensedModules` becomes the row's
   *   complete entitlement set, for legitimate full-state pushes (plan
   *   downgrade/cancellation revoking a module, an admin override, etc.)
   *   where overwriting really is the intent.
   */
  @ApiPropertyOptional({
    enum: ['replace', 'add'],
    default: 'replace',
    description: "'add' unions `licensedModules` into the tenant's existing entitlements instead of replacing them -- use for incremental/add-on approvals. Defaults to 'replace' for full-state pushes.",
  })
  @IsOptional() @IsIn(['replace', 'add'])
  modulesOp?: 'replace' | 'add';

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  maxUsers?: number;

  /**
   * Bug fix (license-expiry-clear, 2026-07-31): `undefined` (field omitted
   * entirely) and explicit `null` now mean two different things, and both
   * must survive JSON transport distinguishably -- `undefined` means "don't
   * touch this row's current expiry," `null` means "clear it" (a PERPETUAL
   * approval has no expiry at all). Previously this was typed as
   * `string | undefined` only, and the only caller
   * (`HospitalsService.approveRequest()`'s cloud branch) collapsed its own
   * `null` ("perpetual, no expiry") into `undefined` via `dto.expiresAt ??
   * undefined` before sending it -- which this endpoint's patch logic then
   * read as "not sent, leave existing value alone," so a PERPETUAL approval
   * could never clear whatever `currentPeriodEnd` a prior trial/period had
   * already set. `null` is now a real, valid value here instead of being
   * squashed into "absent."
   */
  @ApiPropertyOptional({ description: 'ISO-8601 timestamp of the current billing period end, or null to clear it (e.g. a perpetual license). Omit the field entirely to leave it unchanged.', nullable: true })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsISO8601()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  stripeCustomerId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  stripeSubscriptionId?: string;

  /**
   * Audit trail hardening (2026-07-29): "who changed it" -- Vendor Portal's
   * actor identity (e.g. the vendor admin's email/user id), since this is a
   * service-to-service call with no ZoeConnect Cloud user session to read an
   * actor from. Optional only for backward compatibility with any
   * not-yet-updated caller; CloudLicensingController logs 'unknown' when
   * omitted rather than rejecting the request outright.
   */
  @ApiPropertyOptional({ description: "Vendor Portal actor identity (email or user id) who initiated this change -- for the audit trail's \"who\"." })
  @IsOptional() @IsString()
  changedBy?: string;

  /** Audit trail hardening (2026-07-29): "why" -- see SUBSCRIPTION_CHANGE_REASONS. Defaults to 'other' when omitted. */
  @ApiPropertyOptional({ enum: SUBSCRIPTION_CHANGE_REASONS })
  @IsOptional() @IsIn(SUBSCRIPTION_CHANGE_REASONS)
  reason?: SubscriptionChangeReason;

  /**
   * Bug fix (cloud-request-resolution, 2026-07-31): the tenant's own
   * `license_requests` row (backing "License Request History" on the
   * tenant's Settings > License page) previously had NO path to ever leave
   * PENDING for a cloud tenant -- only the self-hosted RSA-signed webhook
   * handler ever called `VendorSyncService.markRequestResolved()`. Vendor
   * Portal already knows this value (it's the `LicenseRequest.id` it
   * assigned when the tenant originally submitted the request, which the
   * tenant-side row stores back as its own `vendorRequestId` -- see
   * `VendorSyncService.submitRequest()`), so passing it through here lets
   * this endpoint resolve that same row to APPROVED as a side effect of the
   * entitlement push, instead of leaving it stuck.
   */
  @ApiPropertyOptional({ description: "The tenant's own pending license_requests row to mark APPROVED as a side effect of this entitlement push (the vendor-portal LicenseRequest id the hospital's request was assigned). Omit if this push isn't resolving a specific request." })
  @IsOptional() @IsString()
  vendorRequestId?: string;
}
