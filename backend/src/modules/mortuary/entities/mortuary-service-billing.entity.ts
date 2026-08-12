import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A). Ports `service_billing`,
 * tenant-scoped. Distinct from `MortuaryBillingService` (`billing_services`)
 * — both existed as separate tables in the source schema; Stage C's
 * business-logic port will clarify the exact distinction between them
 * (not re-derived or merged here, per "preserve schema semantics").
 */
@Entity('mortuary_service_billing')
export class MortuaryServiceBilling {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'body_id', type: 'uuid' })
  bodyId: string;

  @Column({ name: 'billing_id', type: 'uuid', nullable: true })
  billingId: string | null;

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId: string | null;

  @Column({ name: 'service_name', type: 'varchar', length: 255 })
  serviceName: string;

  @Column({ name: 'service_amount', type: 'numeric', precision: 10, scale: 2, default: 0.0 })
  serviceAmount: string;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 10, scale: 2, default: 0.0 })
  discountAmount: string;

  @Column({ name: 'net_amount', type: 'numeric', precision: 10, scale: 2, default: 0.0 })
  netAmount: string;

  @Column({ type: 'varchar', length: 50, default: 'Pending', nullable: true })
  status: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
