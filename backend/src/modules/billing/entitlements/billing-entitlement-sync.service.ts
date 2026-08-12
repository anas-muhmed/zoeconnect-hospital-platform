import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SubscriptionLicense, SubscriptionStatus } from '../../licensing/entities/subscription-license.entity';
import { Tenant } from '../../platform/tenant/entities/tenant.entity';
import { BillingSubscription, BillingSubscriptionStatus } from '../entities/billing-subscription.entity';
import { BillingSubscriptionItem } from '../entities/billing-subscription-item.entity';
import { AuditService } from '../../audit/audit.service';
import { EntitlementSyncPort } from './entitlement-sync.port';

const STATUS_ENTITLES_MODULES: ReadonlySet<BillingSubscriptionStatus> = new Set([
  'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END',
]);

/**
 * Maps ZoeConnect's billing status vocabulary onto `subscription_licenses`
 * / `SubscriptionLicenseProvider`'s pre-existing Stripe-style lowercase
 * vocabulary (see that entity's `SubscriptionStatus` type) -- this
 * mapping is the ONLY place that vocabulary translation happens.
 * CANCEL_AT_PERIOD_END maps to 'active': the tenant keeps its modules
 * until currentPeriodEnd actually passes (SubscriptionLicenseProvider's
 * own expiry check handles the cutoff), exactly matching what
 * `cancelAtPeriodEnd` is supposed to mean.
 */
function toLegacyStatus(status: BillingSubscriptionStatus): SubscriptionStatus {
  switch (status) {
    case 'TRIAL': return 'trialing';
    case 'ACTIVE': return 'active';
    case 'CANCEL_AT_PERIOD_END': return 'active';
    case 'PAST_DUE': return 'past_due';
    case 'CANCELLED': return 'canceled';
    case 'SUSPENDED': return 'suspended';
    case 'INCOMPLETE': return 'incomplete';
    default: return 'incomplete';
  }
}

/**
 * ZoeConnect Billing, Phase 4 -- the SOLE writer of `subscription_licenses`
 * from the billing domain. Implements the approved Phase 4 principles:
 *
 * - ONE-WAY: reads `billing_subscriptions`/`billing_subscription_items`,
 *   writes `subscription_licenses`. Never reads `subscription_licenses`
 *   to make a decision.
 * - IDEMPOTENT: `syncTenant()` always recomputes the FULL desired state
 *   from billing tables and writes it -- calling it 100 times with
 *   unchanged billing state produces identical rows every time. No
 *   incremental/stateful patching that could drift.
 * - PROJECTION: `subscription_licenses` is treated as a derived read-model.
 *   `syncTenant()` and `rebuildTenant()` are the same operation --
 *   "rebuild" is not a special/different code path, it's just re-running
 *   the projection, which is only safe to do at all because the
 *   projection is deterministic.
 * - RECONCILE, NOT DELETE+INSERT: the existing row (if any) is loaded
 *   first, the desired module set is diffed against its current
 *   `licensedModules` (added/removed logged individually via
 *   AuditService), and the row is UPDATEd in place -- never dropped and
 *   recreated. `hospitalName`/`hospitalCode`/`maxUsers`/
 *   `machineFingerprint` (fields billing does not own) are preserved from
 *   the existing row untouched; only billing-owned fields
 *   (subscriptionStatus, licensedModules, currentPeriodEnd, provider*,
 *   billingSubscriptionId) are ever written.
 */
@Injectable()
export class BillingEntitlementSyncService implements EntitlementSyncPort {
  private readonly logger = new Logger(BillingEntitlementSyncService.name);

  constructor(
    @InjectRepository(SubscriptionLicense) private readonly licenseRepo: Repository<SubscriptionLicense>,
    @InjectRepository(BillingSubscription) private readonly subscriptionRepo: Repository<BillingSubscription>,
    @InjectRepository(BillingSubscriptionItem) private readonly itemRepo: Repository<BillingSubscriptionItem>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly auditService: AuditService,
  ) {}

  /** Called by PaymentConfirmedWorkflow right after a BillingSubscription is activated -- the caller already knows the subscription + module list, so this is a thin pass-through into the shared reconcile logic. */
  async syncTenantEntitlements(tenantId: string, subscription: BillingSubscription, moduleCodes: string[], manager?: EntityManager): Promise<void> {
    await this.reconcile(tenantId, subscription, moduleCodes, manager);
  }

  /** Out-of-band entry point: recompute from whatever's currently in `billing_subscriptions`/`billing_subscription_items` for this tenant, without a caller having to already hold the rows. Identical operation to syncTenantEntitlements() -- "rebuild" is not a distinct code path, see class doc comment. */
  async rebuildTenant(tenantId: string): Promise<void> {
    const subscription = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .orderBy('s.created_at', 'DESC')
      .getOne();

    if (!subscription) {
      this.logger.warn(`rebuildTenant(${tenantId}): no billing_subscriptions row found -- nothing to project.`);
      return;
    }
    const items = await this.itemRepo.find({ where: { subscriptionId: subscription.id } });
    const now = Date.now();
    const activeModuleCodes = items.filter((i) => i.periodEnd.getTime() > now).map((i) => i.moduleCode);
    await this.reconcile(tenantId, subscription, activeModuleCodes);
  }

  /** Rebuilds every tenant that has at least one billing_subscriptions row. Intended for ops/support tooling (a script, not an HTTP endpoint) -- deliberately not exposed over the API given the blast radius of running it against every tenant. */
  async rebuildAll(): Promise<{ tenantId: string; ok: boolean; error?: string }[]> {
    const rows = await this.subscriptionRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.tenant_id', 'tenantId')
      .getRawMany<{ tenantId: string }>();

    const results: { tenantId: string; ok: boolean; error?: string }[] = [];
    for (const row of rows) {
      try {
        await this.rebuildTenant(row.tenantId);
        results.push({ tenantId: row.tenantId, ok: true });
      } catch (err) {
        results.push({ tenantId: row.tenantId, ok: false, error: (err as Error).message });
      }
    }
    return results;
  }

  private async reconcile(tenantId: string, subscription: BillingSubscription, requestedModuleCodes: string[], manager?: EntityManager): Promise<void> {
    const licenseRepo = manager ? manager.getRepository(SubscriptionLicense) : this.licenseRepo;
    const tenantRepo = manager ? manager.getRepository(Tenant) : this.tenantRepo;

    const desiredModules = STATUS_ENTITLES_MODULES.has(subscription.status)
      ? Array.from(new Set(requestedModuleCodes)).sort()
      : [];
    const desiredStatus = toLegacyStatus(subscription.status);

    const existing = await licenseRepo.findOne({ where: { tenantId }, order: { updatedAt: 'DESC' } });

    const currentModules = existing?.licensedModules ?? [];
    const added = desiredModules.filter((m) => !currentModules.includes(m));
    const removed = currentModules.filter((m) => !desiredModules.includes(m));
    const statusChanged = existing ? existing.subscriptionStatus !== desiredStatus : true;

    if (existing) {
      existing.subscriptionStatus = desiredStatus;
      existing.licensedModules = desiredModules;
      existing.currentPeriodEnd = subscription.currentPeriodEnd;
      existing.provider = subscription.provider;
      existing.providerCustomerId = subscription.providerCustomerId;
      existing.providerSubscriptionId = subscription.providerSubscriptionId;
      existing.billingSubscriptionId = subscription.id;
      await licenseRepo.save(existing);
    } else {
      // First-ever sync for this tenant -- no subscription_licenses row
      // exists yet (e.g. a tenant that was provisioned before Phase 4, or
      // whose trial row lives only in LicenseMaster/self-hosted). Pull
      // display metadata from Tenant (read-only, cosmetic -- never used
      // for any billing decision, satisfying the one-way rule) since
      // hospitalName/hospitalCode are NOT NULL on subscription_licenses.
      const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
      const created = licenseRepo.create({
        tenantId,
        hospitalName: tenant?.name ?? 'Unknown',
        hospitalCode: tenant?.code ?? tenantId,
        subscriptionStatus: desiredStatus,
        licensedModules: desiredModules,
        currentPeriodEnd: subscription.currentPeriodEnd,
        provider: subscription.provider,
        providerCustomerId: subscription.providerCustomerId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        billingSubscriptionId: subscription.id,
        maxUsers: 5,
      });
      await licenseRepo.save(created);
    }

    if (added.length > 0 || removed.length > 0 || statusChanged) {
      this.auditService.log({
        action: 'BILLING_ENTITLEMENT_SYNCED',
        module: 'BILLING',
        entityType: 'subscription_license',
        entityId: tenantId,
        tenantId,
        metadata: {
          billingSubscriptionId: subscription.id,
          billingStatus: subscription.status,
          projectedStatus: desiredStatus,
          modulesAdded: added,
          modulesRemoved: removed,
          currentModules: desiredModules,
        },
      });
      this.logger.log(`Entitlements synced: tenantId=${tenantId} status=${desiredStatus} added=[${added}] removed=[${removed}]`);
    }
  }
}
