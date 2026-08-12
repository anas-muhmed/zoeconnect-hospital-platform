import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';

export type PaymentIntentStatus = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/**
 * Sits between BillingQuote and BillingPayment (Quote -> PaymentIntent ->
 * Gateway -> Payment), mirroring Stripe's PaymentIntent model. Created by
 * BillingCheckoutService as soon as a quote passes checkout validation
 * (ownership + status=READY + hash verification), BEFORE any gateway
 * order is created -- so "we intend to charge this quote" is durable and
 * auditable even if the subsequent gateway call fails/times out/is
 * retried. One BillingPaymentIntent can end up associated with more than
 * one BillingPayment row only in a retry scenario (first gateway order
 * creation failed outright, before any provider IDs existed); once a
 * BillingPayment reaches SUCCESS the intent moves to SUCCEEDED and is
 * never reused.
 */
@Entity('billing_payment_intents')
export class BillingPaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId: string;

  @Column({ name: 'amount', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'CREATED' })
  status: PaymentIntentStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
