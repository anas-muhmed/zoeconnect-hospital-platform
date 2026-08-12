import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';

/**
 * VendorPortalApiKeyGuard (Cloud Tenant Onboarding — see
 * CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 7, option 1).
 *
 * `TenantProvisioningController` was built (Phase 10, Task 10.7) as an
 * internal, SUPER_ADMIN-JWT-only tool — a human platform operator with an
 * existing ZoeConnect login calls it. Vendor Portal cannot authenticate that way
 * when provisioning a brand-new cloud tenant: there is no ZoeConnect tenant or
 * user yet for it to log in as (the same chicken-and-egg problem the
 * design doc identifies for the login page, one layer earlier). This guard
 * adds a second, additive path — a shared API key Vendor Portal presents
 * via `X-Vendor-Portal-Api-Key` — WITHOUT removing or weakening the
 * existing SUPER_ADMIN JWT path, which keeps working unchanged for the
 * platform-operator use case Phase 10 originally built this for.
 *
 * Deliberately a single combined guard rather than two guards stacked via
 * `@UseGuards(A, B)` — Nest's guard composition is AND (every guard in the
 * array must return true), not "first one that passes wins," so OR
 * semantics between "valid API key" and "valid SUPER_ADMIN JWT" have to be
 * implemented inside one guard. `JwtAuthGuard`/`RolesGuard` are
 * instantiated directly here (both take only a `Reflector`, which is
 * itself trivially injectable) rather than added as constructor-injected
 * providers, so this guard needs no changes to any module's `providers`
 * array to work — it's fully self-contained.
 *
 * Self-hosted is unaffected: `VENDOR_PORTAL_API_KEY` is only required when
 * `DEPLOYMENT_MODE=cloud` (env.validation.ts); in self-hosted it resolves
 * to `''`, and this guard never treats an empty configured key as a valid
 * match (see the `configuredKey` check below) — the API-key path is
 * simply unreachable, and every request falls through to the unchanged
 * JWT+SUPER_ADMIN path.
 */
@Injectable()
export class VendorPortalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(VendorPortalApiKeyGuard.name);
  private readonly jwtAuthGuard: JwtAuthGuard;
  private readonly rolesGuard: RolesGuard;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwtAuthGuard = new JwtAuthGuard(this.reflector);
    this.rolesGuard = new RolesGuard(this.reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-vendor-portal-api-key'];
    const configuredKey = this.config.get<string>('deployment.vendorPortalApiKey', '');

    if (typeof providedKey === 'string' && providedKey.length > 0 && configuredKey.length > 0) {
      if (this.isValidKey(providedKey, configuredKey)) {
        // Marked on the request for TenantProvisioningController/audit
        // logging to know this call came from Vendor Portal, not a human
        // SUPER_ADMIN -- mirrors VendorHmacGuard's `request.vendorContext`
        // convention (vendor-administration/guards/vendor-hmac.guard.ts).
        (request as { isVendorPortal?: boolean }).isVendorPortal = true;
        return true;
      }
      this.logger.warn('Rejected request with invalid X-Vendor-Portal-Api-Key');
      // Deliberately fall through to the JWT path rather than rejecting
      // immediately -- an invalid API key header on a request that also
      // happens to carry a valid SUPER_ADMIN JWT (e.g. a misconfigured
      // Vendor Portal proxy that forwards a stale key alongside an
      // operator's own session) should still succeed via that path, not
      // be blocked by an unrelated header's presence.
    }

    // Unchanged existing path: SUPER_ADMIN JWT.
    await this.jwtAuthGuard.canActivate(context);
    return this.rolesGuard.canActivate(context);
  }

  private isValidKey(provided: string, configured: string): boolean {
    const providedBuf = Buffer.from(provided);
    const configuredBuf = Buffer.from(configured);
    // Lengths must match before timingSafeEqual (it throws on mismatched
    // buffer lengths rather than returning false) -- the length check
    // itself is not constant-time, but leaking the *length* of the correct
    // key is an acceptable, standard trade-off (same as every other
    // timingSafeEqual usage in this codebase, e.g. VendorHmacGuard).
    if (providedBuf.length !== configuredBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, configuredBuf);
  }
}
