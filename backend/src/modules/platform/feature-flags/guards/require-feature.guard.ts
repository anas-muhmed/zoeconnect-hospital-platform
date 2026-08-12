import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { FeatureFlagsService } from '../feature-flags.service';

/**
 * RequireFeatureGuard (Phase 11, Task 11.2).
 *
 * Mirrors `LicenseGuard`'s shape (`modules/licensing/license.guard.ts`):
 * read the decorator's metadata via `Reflector.getAllAndOverride`, no
 * metadata means no restriction (`return true`), otherwise check and
 * throw on failure. Tenant resolution reads `request.tenantId`, populated
 * ambiently upstream by `SubdomainTenantMiddleware` (Phase 8, Task 8.2)
 * before any guard runs — the same field `TenantScopeGuard` already reads
 * directly rather than depending on guard-ordering relative to
 * `JwtAuthGuard`. Falls back to `null` (evaluates the platform-wide
 * default flag row) when no tenant could be resolved — e.g. self-hosted,
 * where every request is implicitly the single 'default' tenant but
 * `SubdomainTenantMiddleware` has nothing to resolve against.
 */
@Injectable()
export class RequireFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureKey) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest['raw'] & { tenantId?: string }>();
    const tenantId = request.tenantId ?? null;

    const enabled = await this.featureFlagsService.isEnabled(tenantId, featureKey);
    if (!enabled) {
      throw new ForbiddenException(`Feature '${featureKey}' is not enabled for this tenant.`);
    }
    return true;
  }
}
