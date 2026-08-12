import { Injectable } from '@nestjs/common';
import { LicenseService } from '../license.service';
import {
  ILicenseProvider,
  LicenseProviderStatus,
} from '../../platform/infrastructure/licensing/license-provider.interface';

/**
 * FileLicenseProvider — Phase 2 ("Infrastructure Abstraction") seam for
 * licensing.
 *
 * Thin wrapper around the existing `LicenseService` singleton: delegates
 * `getStatus()` verbatim, introducing zero behavior change. `LicenseStatus`
 * (declared in `license.service.ts`) is already structurally identical to
 * `LicenseProviderStatus` (declared in the infrastructure interface), so no
 * reshaping is needed here.
 *
 * Self-review fix (Redis-key audit, requested alongside findings 1-5):
 * `tenantId` is now actually passed through to `LicenseService.getStatus()`
 * instead of being discarded. `LicenseGuard` already resolves this from
 * `request.user.tenantId` and passes it here -- previously it was silently
 * dropped, meaning every call (self-hosted or cloud) fell back to
 * `getStatus()`'s no-arg path. `getStatus()` itself now uses this only to
 * select the correct Redis cache key (`CACHE_KEYS.LICENSE(tenantKey)`);
 * self-hosted's `request.user.tenantId` always resolves to its single
 * 'default' tenant, so this is a no-op there.
 */
@Injectable()
export class FileLicenseProvider implements ILicenseProvider {
  constructor(private readonly licenseService: LicenseService) {}

  async getStatus(tenantId?: string): Promise<LicenseProviderStatus> {
    return this.licenseService.getStatus(tenantId);
  }
}
