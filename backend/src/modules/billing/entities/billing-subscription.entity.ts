import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BillingCycle } from './billing-quote.entity';

export type BillingSubscriptionStatus =
  | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCEL_AT_PERIOD_END' | 'CANCELLED' | 'SUSPENDED' | 'INCOMPLETE';

/**
 * Statuses that represent a real, currently-open paid subscription (as
 * opposed to TRIAL, which has never been paid for, or CANCELLED/INCOMPLETE,
 * which have no open billing relationship). Shared by
 * BillingSubscriptionService.determineBillingMode() (drives the
 * NEW_SUBSCRIPTION/ACTIVE_SUBSCRIPTION/REACTIVATION frontend split) and
 * BillingQuoteService.createQuote() (drives SUBSCRIPTION vs
 * MODULE_ADDITION quote typing) so the two decisions can never drift apart.
 */
export const OPEN_SUBSCRIPTION_STATUSES: readonly BillingSubscriptionStatus[] = ['ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END', 'SUSPENDED'];

/**
 * Which of the three distinct billing journeys the Subscribe page should
 * present -- computed server-side (BillingSubscriptionService.
 * determineBillingMode()), never guessed on the frontend from a status
 * string:
 *   - NEW_SUBSCRIPTION: no prior paid subscription. Selected modules are
 *     paid for and activated immediately via the existing quote/checkout/
 *     Razorpay flow.
 *   - ACTIVE_SUBSCRIPTION: an open (ACTIVE/PAST_DUE/CANCEL_AT_PERIOD_END/
 *     SUSPENDED) paid subscription exists. New modules are now ALSO paid
 *     for and activated immediately (subscription upgrade strategy change --
 *     see BillingQuoteType doc comment) via the same quote/checkout/
 *     Razorpay flow, charged in full at the current cycle's price with no
 *     proration; only module REMOVALS remain deferred, scheduled as
 *     PENDING billing_subscription_changes effective at the next renewal
 *     (see BillingSubscriptionChangeService).
 *   - REACTIVATION: the tenant's most recent subscription was paid before
 *     (has a `provider`) but is now fully CANCELLED. Selected modules are
 *     paid for immediately, same mechanics as NEW_SUBSCRIPTION, but the
 *     frontend must never show "no payment due" / "next renewal" copy --
 *     this is a fresh charge that resumes service right away.
 */
export type SubscriptionBillingMode = 'NEW_SUBSCRIPTION' | 'ACTIVE_SUBSCRIPTION' | 'REACTIVATION';

/**
 * The billing-domain subscription record -- what a tenant bought, from
 * whom, and in what state. Deliberately separate from
 * `subscription_licenses` (licensing module), which remains the
 * ENTITLEMENT read table `LicenseGuard`/`SubscriptionLicenseProvider`
 * already consult. BillingEntitlementSyncService (Phase 4) is the single
 * writer that projects this table + BillingSubscriptionItem into
 * `subscription_licenses`. Provider-neutral: `provider` +
 * `providerSubscriptionId`/`providerCustomerId` are generic fields set by
 * whichever PaymentProvider implementation is active
 * (RazorpayPaymentProvider today); no provider-specific terminology
 * appears on this entity.
 */
@Entity('billing_subscriptions')
export class BillingSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'TRIAL' })
  status: BillingSubscriptionStatus;

  @Column({ name: 'billing_cycle', type: 'varchar', length: 16, default: 'MONTHLY' })
  billingCycle: BillingCycle;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate: Date | null;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'provider', type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  @Column({ name: 'provider_customer_id', type: 'varchar', length: 128, nullable: true })
  providerCustomerId: string | null;

  @Column({ name: 'provider_subscription_id', type: 'varchar', length: 128, nullable: true })
  providerSubscriptionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
