import { Injectable, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantContextService } from '../../modules/platform/tenant/tenant-context.service';

/**
 * SubdomainTenantMiddleware (Phase 8 "Multi-Tenancy Activation", Task 8.2).
 *
 * Resolves `req.hostname` to a `Tenant` and attaches `req.tenantId`/
 * `req.tenantCode`. This is deliberately NOT the same thing as
 * `TenantContextStorage`'s ambient per-request tenant (established by
 * `TenantContextInterceptor` from the authenticated principal) — this
 * runs on every request, authenticated or not, before any guard, and
 * answers a different question: "which tenant does this *hostname* claim
 * to belong to," independent of who (if anyone) is logged in.
 *
 * ZoeConnect Identity Architecture Migration, Phase 5: `TenantScopeGuard`
 * (Task 8.3), which used to cross-check this middleware's result against
 * an authenticated request's JWT, is no longer registered (see that
 * class's own doc comment) -- authenticated-request organization
 * resolution comes entirely from the JWT now. `req.tenantId` set here is
 * still legitimately read by: login/HIS-login's own pre-authentication
 * tenant-scoped shadow-mode lookup (`LOGIN_TENANT_SCOPE_MODE`), the CORS
 * origin check in `main.ts`, and `TokenGateway`'s public/kiosk (genuinely
 * unauthenticated) WebSocket connections. This middleware itself keeps
 * running on every request for those remaining consumers.
 *
 * Self-hosted behavior is completely unaffected: no `Tenant` row in a
 * self-hosted install has a non-null `subdomain` (only the seeded
 * 'default' tenant exists, with `subdomain: null`), so
 * `resolveTenantBySubdomain()` always returns `null` there, and this
 * falls back to `getCurrentTenantId()`'s existing 'default' resolution —
 * byte-identical to every pre-Phase-8 request.
 *
 * NOT WIRED UP AS NEST MIDDLEWARE (fix, 2026-07-20 -- real production
 * incident: every cloud login failing "Unable to resolve tenant for this
 * request", 100% reproducible, not intermittent). This class used to be
 * registered via `MiddlewareConsumer.apply(SubdomainTenantMiddleware)` in
 * `app.module.ts`. That's broken for `@nestjs/platform-fastify`: Nest's
 * Fastify middleware compatibility shim (`@fastify/middie`, see
 * `fastify-middie.js`'s `this[kMiddie].run(req.raw, reply.raw, next)`)
 * always invokes Nest-style middleware with the RAW Node
 * `IncomingMessage`/`ServerResponse`, never the real `FastifyRequest`/
 * `FastifyReply` wrapper objects. Every `@Req()` in every controller (and
 * `TenantScopeGuard`'s `context.switchToHttp().getRequest()`) receives
 * that real wrapped `FastifyRequest` instead -- a *different* object.
 * Setting `req.tenantId` on the raw request (as Nest middleware here
 * necessarily would) is therefore invisible to literally every consumer
 * of `req.tenantId` in this codebase: it silently stayed `undefined`
 * everywhere it was read, masked for months by `LOGIN_TENANT_SCOPE_MODE`/
 * `TENANT_SCOPE_GUARD_MODE` defaulting to their non-enforcing modes
 * (`shadow`/`log-only`), which quietly no-op on a missing tenantId
 * instead of surfacing it. Flipping `LOGIN_TENANT_SCOPE_MODE=enforced`
 * made the pre-existing gap fatal on every request instead of silent.
 *
 * The fix: this class is now invoked directly from a genuine Fastify
 * `onRequest` hook registered in `main.ts` (`fastifyInstance.addHook(...)`,
 * bypassing Nest's middleware layer entirely), passed the real
 * `FastifyRequest`/`FastifyReply` objects Fastify itself hands to that
 * hook -- the same objects every controller's `@Req()` and every guard's
 * `getRequest()` subsequently receive. `app.module.ts` no longer
 * registers this via `MiddlewareConsumer` at all.
 */
@Injectable()
export class SubdomainTenantMiddleware {
  private readonly logger = new Logger(SubdomainTenantMiddleware.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  async use(req: FastifyRequest & { tenantId?: string; tenantCode?: string }, _res: FastifyReply, next: () => void) {
    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    const effectiveHost = rawHost?.split(',')[0]?.trim() || req.headers.host;

    const resolved = await this.resolveFromHost(effectiveHost, req.headers.host, rawHost);
    req.tenantId = resolved.tenantId;
    req.tenantCode = resolved.tenantCode;
    next();
  }

  /**
   * Extracted (2026-07-20, real incident -- Token Queue websocket
   * cross-tenant leak in `TokenGateway`) so the exact same
   * subdomain-resolution logic `use()` applies to every HTTP request can
   * also be called from a non-HTTP context. `TokenGateway.handleConnection()`
   * has no Fastify request at all -- socket.io's handshake carries the
   * original `Host`/`X-Forwarded-Host` headers, but there is no Fastify
   * `onRequest` hook for websocket upgrades, so this middleware never ran
   * for them and `client.data` never got a tenantId. Callers pass in
   * whatever host header they have available (`handshake.headers.host`
   * for the gateway); this method does the same subdomain-extract +
   * lookup + 'default'-fallback `use()` always did, just decoupled from
   * the Fastify req/res/next shape.
   */
  async resolveFromHost(
    effectiveHost: string | undefined,
    logHost?: string,
    logXfHost?: string,
  ): Promise<{ tenantId: string; tenantCode: string }> {
    try {
      const subdomain = this.extractSubdomain(effectiveHost);
      const tenant = subdomain ? await this.tenantContext.resolveTenantBySubdomain(subdomain) : null;

      // TEMP DIAGNOSTIC (2026-07-20) -- investigating "Unable to resolve
      // tenant for this request" on mosc.localtest.me logins. Logged at
      // `warn` (not `debug`) so it shows up regardless of the configured
      // log level. Safe to downgrade to `debug` or remove once resolved.
      this.logger.warn(
        `[tenant-resolve] host=${logHost ?? '(none)'} xfHost=${logXfHost ?? '(none)'} effectiveHost=${effectiveHost ?? '(none)'} subdomain=${subdomain ?? '(none)'} tenantFound=${!!tenant}${tenant ? ` tenantId=${tenant.id} code=${tenant.code}` : ''}`,
      );

      if (tenant) {
        return { tenantId: tenant.id, tenantCode: tenant.code };
      }
      // No subdomain, or no tenant matches it -- fall back to the
      // 'default' tenant, exactly like every pre-Phase-8 request.
      return {
        tenantId: await this.tenantContext.getCurrentTenantId(),
        tenantCode: this.tenantContext.getCurrentTenantCode(),
      };
    } catch (err) {
      // Never let tenant resolution itself throw -- fall back to
      // 'default' and let downstream code behave exactly as it did before
      // this middleware existed. Logged, not silent.
      this.logger.warn(`Subdomain tenant resolution failed, falling back to default: ${(err as Error).message} | host=${logHost ?? '(none)'}`);
      return {
        tenantId: await this.tenantContext.getCurrentTenantId(),
        tenantCode: 'default',
      };
    }
  }

  /**
   * Extracts a candidate subdomain label from a `Host` header.
   * Returns `null` for bare domains, localhost, and IP addresses (both
   * have no meaningful "subdomain" to resolve) -- e.g.:
   *   "apollo.hdsp.example.com:443" -> "apollo"
   *   "hdsp.example.com"            -> null (only 2 labels — no subdomain)
   *   "localhost:3000"              -> null
   *   "192.168.1.10:3000"           -> null
   */
  private extractSubdomain(host: string | undefined): string | null {
    if (!host) return null;
    const hostname = host.split(':')[0].trim().toLowerCase();
    if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
    const labels = hostname.split('.');
    if (labels.length < 3) return null; // e.g. "example.com" -- no subdomain label
    return labels[0];
  }
}
