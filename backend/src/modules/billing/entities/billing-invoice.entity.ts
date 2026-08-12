import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../utils/numeric.transformer';

@Entity('billing_invoices')
export class BillingInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 64 })
  invoiceNumber: string;

  @Column({ name: 'amount', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ name: 'tax', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  tax: number;

  @Column({ name: 'currency', type: 'varchar', length: 8, default: 'INR' })
  currency: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ISSUED' })
  status: string;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;
}
