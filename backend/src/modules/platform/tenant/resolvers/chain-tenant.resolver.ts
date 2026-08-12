import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../tenant-context.service';

/**
 * Stage B (Checkpoint B1) — Anonymous-request tenant fallback.
 *
 * RENAMED 2026-08 (production incident + code review follow-up) from
 * `resolveForKnownBranch()` to `resolveDefaultTenantIgnoringBranch()`.
 * The old name was actively misleading: it implied real branch→tenant
 * resolution, but the implementation below has ALWAYS unconditionally
 * returned the platform's single seeded 'default' tenant, ignoring the
 * `branchId` argument entirely. This class was originally written (B1) as
 * a placeholder for a branch→tenant mapping that didn't exist yet ("Phase
 * 10... only this method's body changes, no call site does") — but when
 * Phase 10's real multi-tenant provisioning landed, this method was never
 * revisited, and several call sites went live silently mis-stamping data
 * to the 'default' tenant instead of the real tenant that owned the
 * request (see FeedbackPublicService.submit() / FeedbackComplaintService
 * .submitPublic(), fixed 2026-08 -- public feedback submissions for every
 * cloud tenant were landing under 'default' and were invisible on the
 * submitting hospital's own admin Responses page).
 *
 * FIXED CALLERS (no longer route through this method in the common case):
 * `FeedbackPublicService.submit()` and `FeedbackComplaintService
 * .submitPublic()` now read `tenantId` directly off an already-loaded,
 * already-correctly-stamped entity (`FeedbackQrCode.tenantId` /
 * `FeedbackSubmission.tenantId`, both stamped at authenticated-admin
 * write time by `TenantContextStorage`) and only fall back to this method
 * for legacy rows written before tenant stamping existed at all
 * (`tenantId === null`).
 *
 * STILL-AT-RISK CALLERS (flagged, not yet fixed — see the full caller
 * inventory delivered alongside this rename): every Token-module call
 * site (`WorkstationService.saveConfig()`, `RegistrationService
 * .reserveToken()/mapPatient()/mapVisit()/supervisorReset()`,
 * `TokenQueueService.issueToken()`, and the two derived-JWT branches in
 * `TenantContextInterceptor`) still calls this method as its PRIMARY
 * (not fallback) tenant source, and is therefore silently mis-stamping
 * `TokenRecord.tenantId` to 'default' for every cloud tenant today, same
 * root cause as the Feedback bug. This was NOT fixed in the same pass
 * because a real fix isn't a drop-in: every one of those call sites passes
 * a `branchId` in the HIS/Oracle `orgstructure.id` space (e.g. `'2'`), not
 * an `OrganizationBranch.id` UUID — `OrganizationBranch` (which does have
 * a real `tenant_id` FK) is a deliberately separate, ZoeConnect-native
 * table used only when a tenant has no Oracle HIS connection, so a naive
 * lookup against it would not match any of these callers' branchId values
 * and may not even have rows for HIS-connected tenants at all. Properly
 * fixing the Token module needs its own dedicated investigation into what
 * branch→tenant mapping actually exists/should exist there before any
 * code changes — tracked as a follow-up, not silently left as this
 * method's problem to eventually paper over.
 *
 * This method logs a warning on every call specifically so that "silently"
 * stops being true — any environment where a real cloud tenant is still
 * hitting this fallback (Token module today; a legacy pre-stamped Feedback
 * row) now shows up in application logs rather than only ever surfacing as
 * a confused support ticket.
 */
@Injectable()
export class ChainTenantResolver {
  private readonly logger = new Logger(ChainTenantResolver.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  /**
   * Returns the platform's single seeded 'default' tenant, unconditionally
   * — `branchId` is accepted (so call sites already have the right shape
   * for when/if a real per-branch mapping is implemented) but NOT
   * currently used for resolution. Do not treat a non-null return here as
   * proof `branchId` was actually resolved to anything -- see this class's
   * own doc comment.
   */
  async resolveDefaultTenantIgnoringBranch(branchId: string | null): Promise<string> {
    const tenantId = await this.tenantContext.getCurrentTenantId();
    this.logger.warn(
      `resolveDefaultTenantIgnoringBranch(branchId=${branchId ?? 'null'}) -- branchId was NOT used for resolution, ` +
      `returning the seeded 'default' tenant (${tenantId}). If this request actually belongs to a real cloud tenant, ` +
      `its data is being mis-stamped. See this class's doc comment.`,
    );
    return tenantId;
  }
}
