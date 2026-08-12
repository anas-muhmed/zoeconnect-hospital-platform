import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** Mortuary integration (Phase 2, Stage A). Ports `housekeeping_tasks`, tenant-scoped. */
@Entity('mortuary_housekeeping_tasks')
export class MortuaryHousekeepingTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'cabin_id', type: 'uuid' })
  cabinId: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string;

  @Column({ name: 'assigned_to', type: 'varchar', length: 255, nullable: true })
  assignedTo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
