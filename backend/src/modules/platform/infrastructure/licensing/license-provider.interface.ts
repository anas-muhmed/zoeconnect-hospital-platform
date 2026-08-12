/**
 * Status shape returned by ILicenseProvider.getStatus().
 *
 * Deliberately declared locally rather than imported from
 * `modules/licensing/license.service.ts` — infrastructure interfaces
 * must not depend on Business/Platform-layer modules (dependency
 * direction is the other way around). Kept structurally compatible
 * with today's `LicenseStatus` so Phase 2's `FileLicenseProvider`
 * (wrapping the existing `LicenseService` unchanged) can implement
 * this interface without reshaping its return value.
 */
export interface LicenseProviderStatus {
  isValid: boolean;
  isTrial: boolean;
  hospitalName: string;
  hospitalCode: string;
  licensedModules: string[];
  maxUsers: number;
  expiresAt: Date | null;
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  machineFingerprint: string | null;
  moduleExpiries: Record<string, Date | null>;
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  gracePeriodModules: string[];
}

/**
 * ILicenseProvider (Phase 0 scaffolding — Hybrid Architecture roadmap).
 *
 * Shaped from today's `LicenseService.getStatus()`. `tenantId` is
 * optional and unused until Phase 1 (Tenant Foundation) exists —
 * included now so Phase 2's `FileLicenseProvider` and later
 * `SubscriptionLicenseProvider` (Phase 4) share one signature from
 * the start, per the roadmap's forward reference to
 * `ILicenseProvider.getStatus(tenantId)`.
 *
 * Pure interface only — no implementation, no DI token, no consumer
 * yet. Nothing in the codebase depends on this today.
 */
export interface ILicenseProvider {
  getStatus(tenantId?: string): Promise<LicenseProviderStatus>;
}
