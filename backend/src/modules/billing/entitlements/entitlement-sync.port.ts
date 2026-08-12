import { EntityManager } from 'typeorm';
import { BillingSubscription } from '../entities/billing-subscription.entity';

/**
 * Port (interface) for projecting a BillingSubscription's module set into
 * the existing entitlement layer (`subscription_licenses` /
 * LicenseGuard / SubscriptionLicenseProvider). Phase 3's
 * PaymentConfirmedWorkflow calls this AFTER activating the billing
 * subscription -- it never touches `subscription_licenses` itself (per
 * the Phase 2 constraint: billing must not directly modify module
 * entitlements from anywhere except this single seam).
 *
 * ONE-WAY FLOW (Phase 4 hard rule): implementations read
 * `billing_subscriptions`/`billing_subscription_items` and WRITE
 * `subscription_licenses`. Nothing in the billing domain ever reads
 * `subscription_licenses` back to make a billing decision --
 * `subscription_licenses` is a projection/read-model of billing state,
 * never the other way around.
 *
 * `manager` (optional) lets the caller (PaymentConfirmedWorkflow) run the
 * sync inside the same DB transaction as subscription activation/invoice
 * generation -- omit it for out-of-band calls (rebuild tooling, an
 * eventual renewal cron).
 */
export interface EntitlementSyncPort {
  syncTenantEntitlements(
    tenantId: string,
    subscription: BillingSubscription,
    moduleCodes: string[],
    manager?: EntityManager,
  ): Promise<void>;
}

export const ENTITLEMENT_SYNC = Symbol('ENTITLEMENT_SYNC');
