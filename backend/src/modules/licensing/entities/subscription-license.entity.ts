import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'suspended';

/**
 * SubscriptionLicense (Phase 4 "Licensing Providers", Task 4.2).
 *
 * Local, ZoeConnect-side mirror of the billing-shaped fields the prior audit
 * recommended adding to the Vendor Portal's `Hospital`/`IssuedLicense`
 * schema (`stripeCustomerId`, `planId`, billing status). That Vendor
 * Portal-side migration is coordinated separately and is out of this
 * backend roadmap's direct scope (per the roadmap's own Task 4.2 note) --
 * this table is ZoeConnect's own local copy, populated the same way
 * `LicenseMaster`/`VendorRegistration` already are: synced down via the
 * vendor webhook path, not queried live against an external system. No
 * Stripe integration exists yet; this table and `SubscriptionLicenseProvider`
 * exist to prove `ILicenseProvider`'s shape holds for a second, differently
 * structured backing store -- not to process real billing events yet.
 *
 * Not yet populated by any webhook handler and not yet bound as the active
 * `LICENSE_PROVIDER` in any deployment (see Task 4.3 -- default stays
 * `file`). A future task wires `LicenseService.processWebhookEvent()` (or a
 * new subscription-specific webhook) to actually write rows here.
 */
@Entity('subscription_licenses')
export class SubscriptionLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Nullable, matching every other Phase-1-backfilled entity in this
   * codebase -- 'no tenant-mapping infrastructure exists yet' (Phase 10)
   * is still true here. A null tenantId is treated as "the default/only
   * tenant" by SubscriptionLicenseProvider, mirroring FileLicenseProvider.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'hospital_name', type: 'varchar', length: 255 })
  hospitalName: string;

  @Column({ name: 'hospital_code', type: 'varchar', length: 64 })
  hospitalCode: string;

  /** Unused, kept for backward compatibility -- see AddProviderColumnsToSubscriptionLicenses migration doc comment. Nothing writes to these anymore; use provider/providerCustomerId/providerSubscriptionId below. */
  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 128, nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', length: 128, nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ name: 'plan_id', type: 'varchar', length: 64, nullable: true })
  planId: string | null;

  /**
   * ZoeConnect Billing, Phase 1/4 (AddProviderColumnsToSubscriptionLicenses
   * migration). Provider-neutral replacement for the stripe_* columns
   * above -- written exclusively by BillingEntitlementSyncService
   * (modules/billing/entitlements), the sole writer of this table from
   * the billing domain.
   */
  @Column({ name: 'provider', type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  @Column({ name: 'provider_customer_id', type: 'varchar', length: 128, nullable: true })
  providerCustomerId: string | null;

  @Column({ name: 'provider_subscription_id', type: 'varchar', length: 128, nullable: true })
  providerSubscriptionId: string | null;

  /** FK (unenforced at the ORM level, enforced by column type only) back to billing_subscriptions.id -- lets support tooling jump from a license row to its owning billing subscription. */
  @Column({ name: 'billing_subscription_id', type: 'uuid', nullable: true })
  billingSubscriptionId: string | null;

  @Column({ name: 'subscription_status', type: 'varchar', length: 32, default: 'trialing' })
  subscriptionStatus: SubscriptionStatus;

  @Column({ name: 'licensed_modules', type: 'jsonb', default: () => "'[]'" })
  licensedModules: string[];

  @Column({ name: 'max_users', type: 'int', default: 5 })
  maxUsers: number;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ name: 'machine_fingerprint', type: 'varchar', length: 64, nullable: true })
  machineFingerprint: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
