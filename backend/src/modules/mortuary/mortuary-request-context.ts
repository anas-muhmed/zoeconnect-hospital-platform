import type { User } from '../users/entities/user.entity';

/**
 * Mortuary integration (Phase 2, Stage D).
 *
 * Carries the per-request identity a Mortuary service needs, built by each
 * controller from `@CurrentUser()`.
 *
 * Stage C introduced a single provisional `isAdmin` boolean here as a
 * stand-in for two distinct source business rules that both needed *some*
 * admin-tier gate before real RBAC existed. Stage D replaces it with two
 * precise, permission-backed flags — each business rule was always
 * conceptually separate (a role could plausibly have one override without
 * the other), and lumping them into one flag would have been less correct
 * than the thing it replaced:
 *
 *  - `canOverrideAllocationAdvance` — MORTUARY:ALLOCATIONS:OVERRIDE_ADVANCE.
 *    Source: allocationController.js::createAllocation — only Admin/
 *    SuperAdmin may set a custom cabin-allocation advance amount above the
 *    tenant's configured minimum; everyone else's request silently uses
 *    the minimum. Sole consumer: `MortuaryCabinAllocationsService.create()`.
 *  - `canOverrideBillingCharge` — MORTUARY:BILLING:OVERRIDE_CHARGE.
 *    Source: billingController.js::generateBilling — only Admin/SuperAdmin
 *    may set a custom body-dressing service charge; everyone else's
 *    request gets the service-master approved tariff. Sole consumer:
 *    `MortuaryBillingService.generate()`.
 *
 * `User.hasPermission()` already returns `true` unconditionally for
 * `isSuperAdmin` (see that getter), so SUPER_ADMIN continues to pass both
 * checks without any special-casing here.
 */
export interface MortuaryRequestContext {
  tenantId: string;
  userId: string;
  canOverrideAllocationAdvance: boolean;
  canOverrideBillingCharge: boolean;
}

export function buildMortuaryContext(user: User): MortuaryRequestContext {
  return {
    tenantId: user.tenantId,
    userId: user.id,
    canOverrideAllocationAdvance: user.hasPermission('MORTUARY:ALLOCATIONS:OVERRIDE_ADVANCE'),
    canOverrideBillingCharge: user.hasPermission('MORTUARY:BILLING:OVERRIDE_CHARGE'),
  };
}
