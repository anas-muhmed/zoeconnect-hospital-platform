import type { User } from '../users/entities/user.entity';

/**
 * Mortuary integration (Phase 2, Stage C).
 *
 * Carries the per-request identity a Mortuary service needs, built by each
 * controller from `@CurrentUser()`. `isAdmin` is a PROVISIONAL stand-in for
 * one specific source business rule (allocationController.js: only
 * Admin/SuperAdmin may override the default cabin-allocation advance
 * amount — everyone else's request silently uses the hospital's configured
 * minimum). It is NOT a general authorization mechanism and must not grow
 * new call sites beyond that one rule.
 *
 * Stage D replaces this with a real `MORTUARY:*` permission check via
 * `PermissionsGuard`/`@RequirePermissions()` once the permission matrix is
 * designed and audited — this placeholder exists so that one specific
 * pricing-integrity rule isn't silently dropped in the meantime. Every
 * other authorization decision (who may even reach a given endpoint at
 * all) is explicitly OUT of scope for Stage C — see the Stage C report.
 */
export interface MortuaryRequestContext {
  tenantId: string;
  userId: string;
  isAdmin: boolean;
}

export function buildMortuaryContext(user: User): MortuaryRequestContext {
  const isAdmin = user.isSuperAdmin || (user.roles ?? []).some((r) => r.name === 'Mortuary Admin');
  return { tenantId: user.tenantId, userId: user.id, isAdmin };
}
