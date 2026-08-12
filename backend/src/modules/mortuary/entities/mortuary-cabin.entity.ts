import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A/B). Ports `cabins`, tenant-scoped.
 *
 * Stage B deviation (D2): `cabinNumber` moves from the source's flat
 * GLOBAL UNIQUE to UNIQUE ("tenantId", "cabinNumber") — see the Stage B
 * migration's doc comment for rationale. `dailyRate` is nullable
 * (Stage B deviation: none — the source's own `ALTER TABLE ... ADD
 * COLUMN daily_rate` had no NOT NULL either, preserved as-is).
 */
@Entity('mortuary_cabins')
@Unique(['tenantId', 'cabinNumber'])
export class MortuaryCabin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'cabin_number', type: 'varchar', length: 50 })
  cabinNumber: string;

  @Column({ type: 'varchar', length: 50, default: 'Available', nullable: true })
  status: string | null;

  @Column({ type: 'real', default: 500, nullable: true })
  tariff: number | null;

  @Column({ name: 'daily_rate', type: 'numeric', precision: 10, scale: 2, default: 500.0, nullable: true })
  dailyRate: string | null;

  @Column({ type: 'int', default: 1 })
  floor: number;

  @Column({
    name: 'cabin_type',
    type: 'enum',
    enum: ['FREEZER', 'NORMAL_CABIN'],
    default: 'NORMAL_CABIN',
    nullable: true,
  })
  cabinType: 'FREEZER' | 'NORMAL_CABIN' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
