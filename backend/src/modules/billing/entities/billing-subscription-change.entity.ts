import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type SubscriptionChangeAction = 'ADD' | 'REMOVE';
export type SubscriptionChangeStatus = 'PENDING' | 'APPLIED' | 'CANCELLED';

/**
 * ZoeConnect Billing -- Subscription Change Management foundation.
 *
 * A tenant that already has an ACTIVE (or PAST_DUE/CANCEL_AT_PERIOD_END)
 * subscription never gets a second `billing_payments`/checkout cycle just
 * to add or remove a single module mid-period -- that would require
 * proration, which this phase deliberately does not implement (see
 * BillingSubscriptionChangeService's doc comment). Instead, an ADD or
 * REMOVE intent is recorded here as PENDING, `billing_subscription_items`
 * is left completely untouched until `effective_date` (today, the
 * tenant's `currentPeriodEnd` at the moment the change was scheduled --
 * snapshotted here the same way BillingQuote snapshots its price, so it
 * never silently drifts if the subscription's period end changes later
 * for an unrelated reason), and a future renewal-execution step applies
 * every due PENDING row atomically, updates
 * `billing_subscription_items`, and re-runs entitlement sync -- see
 * `BillingSubscriptionChangeService.applyDueChanges()`.
 *
 * `billing_subscription_items` remains the sole source of truth for what
 * a tenant is CURRENTLY licensed for; this table only ever describes
 * intent that hasn't taken effect yet.
 */
@Entity('billing_subscription_changes')
export class BillingSubscriptionChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode: string;

  @Column({ name: 'action', type: 'varchar', length: 16 })
  action: SubscriptionChangeAction;

  @Column({ name: 'effective_date', type: 'timestamptz' })
  effectiveDate: Date;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'PENDING' })
  status: SubscriptionChangeStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
