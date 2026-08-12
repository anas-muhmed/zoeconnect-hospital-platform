import {
  Injectable, CanActivate, ExecutionContext, Inject,
  ForbiddenException, ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ILicenseProvider } from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER } from '../platform/infrastructure/tokens';
import { MODULE_KEY } from './decorators/require-module.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Guards routes that require a specific licensed module to be active.
 * If the license has expired or the module is not included in the license,
 * returns 503 Service Unavailable.
 *
 * Apply at controller or handler level:
 *   @UseGuards(JwtAuthGuard, LicenseGuard)
 *   @RequireModule('LOYALTY')
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequireModule decorator → guard passes through
    if (!requiredModule) return true;

    // Tenant-aware licensing fix: every call site pairs this guard with
    // JwtAuthGuard earlier in the same @UseGuards(...) array (confirmed
    // across every controller that uses LicenseGuard), so `request.user`
    // is already the full `User` entity (JwtStrategy.validate()) by the
    // time this guard runs -- guards execute in array order, before any
    // interceptor, so TenantContextStorage/TenantContextInterceptor is NOT
    // an option here (it hasn't run yet). Reading `request.user.tenantId`
    // directly is the only correct source at this point in the pipeline.
    // Previously called getStatus() with no argument at all: harmless for
    // FileLicenseProvider (self-hosted default, ignores tenantId by
    // design -- see file-license.provider.ts), but SubscriptionLicenseProvider
    // (bound when LICENSE_PROVIDER_MODE=subscription) would fall back to its
    // `tenantId: IsNull()` branch, which can never match a real cloud
    // tenant's SubscriptionLicense row (TenantProvisioningService always
    // stamps a real UUID) -- every module-gated route would 503 for every
    // cloud tenant simultaneously the moment that mode is ever turned on.
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId ?? undefined;

    // Real incident (2026-07-30): a genuinely valid, active cloud tenant's
    // kiosk devices got a hard 503 "license has expired or is invalid" on
    // every hit to GET /kiosk/:slug and GET /token/print-config -- both
    // @Public() (kiosks are unauthenticated physical devices, there is no
    // JWT and never will be), and both class-decorated with @RequireModule
    // via this same guard. `request.user` is `undefined` for a @Public()
    // route (JwtAuthGuard short-circuits to `true` without running its
    // strategy), so `tenantId` above is always `undefined` here -- and
    // SubscriptionLicenseProvider.getStatus(undefined) (the provider bound
    // for every cloud deployment) falls back to its `tenantId: IsNull()`
    // branch, which can never match any real cloud tenant's
    // SubscriptionLicense row (every one has a real, non-null tenantId --
    // see TenantProvisioningService.stepIssueTrialLicense()). Self-hosted
    // never surfaced this: FileLicenseProvider.getStatus(undefined) always
    // resolves the same single global license record regardless of
    // whether a tenantId is supplied, so this exact code path has always
    // been silently exercised there with no ill effect.
    //
    // There is no architecturally clean way to resolve a real per-tenant
    // identity here for a route like this: guards run before the handler
    // body, so a kiosk's own tenantId (real and resolvable -- TokenKiosk
    // has its own tenantId column, looked up by :slug) isn't available yet
    // at this point in the pipeline, and print-config's own implementation
    // is a single GLOBAL config row with no tenant concept at all in the
    // first place. Rather than leave every cloud tenant's kiosk hard-down,
    // this restores exactly the self-hosted-equivalent behavior described
    // above: when NO tenant can be resolved at all for a @Public() route,
    // skip the license/module gate for this request instead of failing
    // closed against a tenant identity that was never available to check
    // in the first place. Routes that DO have a resolvable tenantId
    // (an authenticated request's JWT) are completely unaffected -- this
    // only changes behavior for the specific "public route, no JWT, no
    // tenant to check" case that previously always hard-failed for cloud.
    //
    // A more complete fix would give kiosk-slug-based public routes real
    // ambient tenant context before this guard runs (e.g. a dedicated
    // middleware resolving req.tenantId from the :slug route param, the
    // same idiom SubdomainTenantMiddleware used for Host-based resolution
    // before subdomains were removed) -- left as follow-up work, out of
    // scope for this immediate correctness fix.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic && !tenantId) {
      return true;
    }

    const status = await this.licenseProvider.getStatus(tenantId);

    if (!status.isValid) {
      throw new ServiceUnavailableException(
        'Platform license has expired or is invalid. Contact your system administrator.',
      );
    }

    if (!status.licensedModules.includes(requiredModule)) {
      throw new ForbiddenException(
        `Module "${requiredModule}" is not included in your license. Please upgrade.`,
      );
    }

    return true;
  }
}
