import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** Mortuary integration (Phase 2, Stage A). Ports `service_master`, tenant-scoped. */
@Entity('mortuary_service_master')
export class MortuaryServiceMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'service_name', type: 'varchar', length: 255 })
  serviceName: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0.0 })
  tariff: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
