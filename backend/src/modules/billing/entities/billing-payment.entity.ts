import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';

export type BillingPaymentStatus = 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED';

/**
 * A single payment attempt, provider-neutral. `provider` selects which
 * PaymentProvider produced `providerOrderId`/`providerPaymentId`
 * (e.g. 'razorpay'); the billing/subscription services never branch on
 * provider identity themselves -- only the provider adapter and the
 * webhook controller do.
 */
@Entity('billing_payments')
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'quote_id', type: 'uuid', nullable: true })
  quoteId: string | null;

  @Column({ name: 'payment_intent_id', type: 'uuid', nullable: true })
  paymentIntentId: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 32 })
  provider: string;

  @Column({ name: 'provider_payment_id', type: 'varchar', length: 128, nullable: true })
  providerPaymentId: string | null;

  @Column({ name: 'provider_order_id', type: 'varchar', length: 128, nullable: true })
  providerOrderId: string | null;

  @Column({ name: 'amount', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'CREATED' })
  status: BillingPaymentStatus;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
