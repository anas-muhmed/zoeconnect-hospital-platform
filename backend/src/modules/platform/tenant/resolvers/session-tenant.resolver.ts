import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../tenant-context.service';

/**
 * The shape of principal object this resolver needs. Deliberately structural
 * (not imported from `User`/`ReservationCapabilityPrincipal`/
 * `WorkstationPrincipal` directly) to avoid a hard dependency from the
 * platform/tenant module back into auth/users — any object with an optional
 * `tenantId` satisfies it.
 */
export interface SessionPrincipal {
  tenantId?: string | null;
}

/**
 * Stage B (Checkpoint B1) — Session-derived tenant resolver.
 *
 * Pattern 1 from `STAGE_B_DESIGN.md` §3: the majority of tables, where
 * tenant is resolved from the authenticated request's principal. This is a
 * plain, stateless, unit-testable resolver — it does NOT read from Nest's
 * request context itself (no `Scope.REQUEST`, no `@Inject(REQUEST)`). The
 * codebase has no existing precedent for request-scoped providers, and nothing
 * calls this yet, so introducing that DI pattern speculatively here would add
 * complexity with no present benefit. Instead, the caller (an interceptor or
 * guard, wired in B2) is expected to pass the already-resolved `req.user`
 * principal in explicitly.
 *
 * `User.tenantId` was added nullable in Stage A (A2) and is still unread by
 * any code path — this resolver is the first reader, and even then only once
 * something actually calls `resolve()`, which nothing does as of B1. Falls
 * back to the seeded 'default' tenant via `TenantContextService` when the
 * principal carries no tenant (e.g. legacy tokens minted before this field
 * existed, or a principal that intentionally has no tenant of its own).
 */
@Injectable()
export class SessionTenantResolver {
  constructor(private readonly tenantContext: TenantContextService) {}

  async resolve(principal?: SessionPrincipal | null): Promise<string> {
    if (principal?.tenantId) {
      return principal.tenantId;
    }
    return this.tenantContext.getCurrentTenantId();
  }
}
