import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/** Mortuary integration (Phase 2, Stage A). Ports `cabins`, tenant-scoped. */
@Entity('mortuary_cabins')
export class MortuaryCabin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'cabin_number', type: 'varchar', length: 50, unique: true })
  cabinNumber: string;

  @Column({ type: 'varchar', length: 50, default: 'Available' })
  status: string;

  @Column({ type: 'real', default: 500 })
  tariff: number;

  @Column({ name: 'daily_rate', type: 'numeric', precision: 10, scale: 2, default: 500.0 })
  dailyRate: string;

  @Column({ type: 'int', default: 1 })
  floor: number;

  @Column({
    name: 'cabin_type',
    type: 'enum',
    enum: ['FREEZER', 'NORMAL_CABIN'],
    default: 'NORMAL_CABIN',
  })
  cabinType: 'FREEZER' | 'NORMAL_CABIN';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
