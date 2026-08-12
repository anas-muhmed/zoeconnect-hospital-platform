/**
 * TenantProvisioned (Phase 10, Task 10.6 / spec Section 8.1 step 10).
 *
 * Emitted via the app-wide `EventEmitter2` (already registered globally in
 * app.module.ts, Stage B) once a provisioning run reaches `completed`.
 * "For downstream welcome-email/onboarding-checklist consumers" per the
 * roadmap's own step 10 text -- no listener exists yet in this phase (no
 * welcome-email consumer is one of Phase 10's 8 named tasks), so this
 * event is emitted but currently unconsumed. That is intentional, not an
 * oversight: the event contract is established now so a future consumer
 * can be added without touching TenantProvisioningService again.
 */
export const TENANT_PROVISIONED_EVENT = 'tenant.provisioned';

export class TenantProvisionedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly tenantCode: string,
    public readonly hospitalName: string,
    /** Historical/backward-compatibility only as of Phase 6 -- may be null; never derive auth or login-URL logic from this. */
    public readonly subdomain: string | null,
    public readonly adminUserId: string,
    public readonly adminEmail: string,
    public readonly provisioningRunId: string,
  ) {}
}
