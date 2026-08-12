import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A). Ports `cabin_allocations`, tenant-scoped.
 * `bodyId`/`cabinId` kept as plain FK columns (not TypeORM relations) for
 * this stage — consistent with how the rest of Mortuary's entities are
 * ported here; relations can be added in Stage C if a service genuinely
 * needs eager-loaded joins.
 */
@Entity('mortuary_cabin_allocations')
export class MortuaryCabinAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'body_id', type: 'uuid' })
  bodyId: string;

  @Column({ name: 'cabin_id', type: 'uuid' })
  cabinId: string;

  @Column({ name: 'admission_date_time', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  admissionDateTime: Date;

  @Column({ name: 'release_date_time', type: 'timestamp', nullable: true })
  releaseDateTime: Date | null;

  @Column({ name: 'estimated_release_date_time', type: 'timestamp', nullable: true })
  estimatedReleaseDateTime: Date | null;

  @Column({ name: 'advance_amount', type: 'real', default: 0 })
  advanceAmount: number;

  @Column({ name: 'hourly_rate', type: 'real', default: 50 })
  hourlyRate: number;

  @Column({ name: 'min_hours', type: 'int', default: 4 })
  minHours: number;

  @Column({ name: 'free_hours', type: 'int', default: 0 })
  freeHours: number;

  @Column({ type: 'varchar', length: 50, default: 'Allocated' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
