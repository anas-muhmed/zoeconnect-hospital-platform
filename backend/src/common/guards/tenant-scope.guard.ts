import { Injectable, Logger, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

/**
 * TenantScopeGuard (Phase 8 "Multi-Tenancy Activation", Task 8.3).
 *
 * NO LONGER REGISTERED (ZoeConnect Identity Architecture Migration, Phase 5)
 * -- app.module.ts's `providers` array no longer includes this as an
 * `APP_GUARD`. This guard's entire job was cross-checking an authenticated
 * request's JWT `tenantId` claim against `request.tenantId`, resolved from
 * the Host header by `SubdomainTenantMiddleware` -- exactly the
 * "Host-header dependency for authenticated requests" that phase removes.
 * Kept in the tree (not deleted) purely for reference/rollback; every other
 * authenticated-request org-resolution path already read from the JWT
 * (`TenantContextInterceptor`/`TenantContextStorage` read
 * `request.user.tenantId`, never Host), so this guard's removal does not
 * change how organization scoping actually works for real business-logic
 * queries -- it only stops a redundant safety cross-check that depended on
 * a Host header no longer considered part of the trust boundary. If ever
 * re-registered, note that `AUTH_IDENTITY_MODE=global` (Phase 3) makes the
 * whole premise of "one Host maps to one tenant" invalid, since a global
 * login has no per-request Host-to-tenant mapping at all.
 *
 * Original doc comment follows, describing the gap this closed while it was
 * registered:
 *
 * Closes the "hospital A user logs into hospital B's subdomain" gap: for
 * any request carrying a standard user-session access token, verifies the
 * token's `tenantId` claim (Task 8.1) matches `request.tenantId` (resolved
 * from the Host header by `SubdomainTenantMiddleware`, Task 8.2).
 *
 * Deliberately self-contained rather than relying on `request.user` being
 * populated by an earlier-run `JwtAuthGuard` — this codebase applies
 * `JwtAuthGuard` per-controller (`@UseGuards(JwtAuthGuard, ...)`), not
 * globally, so this guard's own execution order relative to it is not
 * guaranteed if registered as a global `APP_GUARD` (Nest runs global
 * guards before controller-scoped ones). Instead, this guard extracts and
 * verifies the bearer token itself (same secret, same extractors as
 * `JwtStrategy`) — cheap, stateless, no DB hit — so it works correctly
 * regardless of guard registration order, and never depends on
 * `JwtAuthGuard` having already run.
 *
 * This guard does NOT perform authentication itself (a missing/invalid
 * token is simply not cross-checked here — `JwtAuthGuard`, wherever it's
 * applied, remains the sole authority on "is this request authenticated
 * at all"). It only adds one more check on top when a *valid* standard
 * user-session token exists.
 *
 * Scope limit, documented rather than silently expanded: derived-JWT
 * principals (`reservation-capability`/`workstation` tokens, minted by
 * `RegistrationService`/`WorkstationService`) carry a `branchId`, not a
 * `tenantId` claim, and their tenant resolution already correctly routes
 * through `ChainTenantResolver` inside `TenantContextInterceptor` (Stage B
 * Checkpoint B5). Retrofitting branch->tenant resolution into this guard
 * too would duplicate that logic and risk drift between the two
 * codepaths — deliberately left out of Phase 8, enforcement here covers
 * standard user-session tokens only, which is the specific gap the
 * roadmap names for this task.
 *
 * Rollout mode (roadmap's own explicit rollback strategy): `TENANT_SCOPE_GUARD_MODE`
 * (`log-only` | `enforced`, default `log-only`) — a mismatch is always
 * logged; only `enforced` mode actually throws. This is the real safety
 * net for this phase, not a permanent feature flag — the roadmap
 * describes flipping to `enforced` once log-only mode has run clean.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  private readonly logger = new Logger(TenantScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest['raw'] & { tenantId?: string; tenantCode?: string }>();

    const token = this.extractToken(request);
    if (!token) return true; // no token to cross-check -- JwtAuthGuard's job to reject, not this guard's

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, { secret: this.config.get<string>('jwt.secret') });
    } catch {
      return true; // invalid/expired token -- JwtAuthGuard's job to reject, not this guard's
    }

    // Derived-JWT shapes (workstation/reservation-capability) and legacy
    // tokens minted before Task 8.1 both lack `tenantId` -- nothing to
    // cross-check, allow through (see class doc comment's scope-limit note).
    if (!payload.tenantId) return true;

    const resolvedTenantId = request.tenantId;
    if (resolvedTenantId && payload.tenantId !== resolvedTenantId) {
      const mode = this.config.get<string>('TENANT_SCOPE_GUARD_MODE', 'log-only');
      this.logger.warn(
        `Tenant scope mismatch: token tenantId=${payload.tenantId} (user=${payload.username}) vs. resolved request tenantId=${resolvedTenantId} (host=${request.headers.host}) — mode=${mode}`,
      );
      if (mode === 'enforced') {
        throw new ForbiddenException('This account is not authorized for this tenant.');
      }
    }

    return true;
  }

  private extractToken(request: FastifyRequest['raw'] & { query?: Record<string, unknown> }): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    // Mirrors JwtStrategy's second extractor (EventSource/SSE routes can't
    // set custom headers) -- Fastify's raw request exposes the parsed
    // query string via `req.query` once fastify's own routing has run;
    // fall back to manual parsing from the URL if not yet populated.
    const url = request.url ?? '';
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    return params.get('access_token');
  }
}
