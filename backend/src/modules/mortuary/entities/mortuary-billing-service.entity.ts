import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Mortuary integration (Phase 2, Stage A). Ports `billing_services`, tenant-scoped. */
@Entity('mortuary_billing_services')
export class MortuaryBillingService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'billing_id', type: 'uuid' })
  billingId: string;

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId: string | null;

  @Column({ name: 'service_name', type: 'varchar', length: 255 })
  serviceName: string;

  @Column({ type: 'real' })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
