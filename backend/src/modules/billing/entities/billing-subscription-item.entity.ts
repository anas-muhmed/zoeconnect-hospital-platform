import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { BillingCycle } from './billing-quote.entity';
import { numericTransformer } from '../utils/numeric.transformer';

/** One row per licensed module on a BillingSubscription. */
@Entity('billing_subscription_items')
export class BillingSubscriptionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId: string;

  @Column({ name: 'module_code', type: 'varchar', length: 64 })
  moduleCode: string;

  @Column({ name: 'quantity', type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  unitPrice: number;

  @Column({ name: 'billing_cycle', type: 'varchar', length: 16 })
  billingCycle: BillingCycle;

  /**
   * This item's OWN paid-through date -- independent of the parent
   * subscription's `currentPeriodEnd`. A module stays entitled (see
   * BillingEntitlementSyncService/BillingSubscriptionService.
   * listActiveItemModuleCodes()) only while `periodEnd > now`, regardless
   * of the subscription's overall status/renewal date. Extended by
   * BillingSubscriptionService.extendSubscriptionItem() ("buy N more
   * months" on an already-licensed module) without touching any other
   * item or the subscription row itself.
   */
  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
