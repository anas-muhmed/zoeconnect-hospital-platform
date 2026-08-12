import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/** Mortuary integration (Phase 2, Stage A). Ports `concession_authorities`, tenant-scoped. */
@Entity('mortuary_concession_authorities')
export class MortuaryConcessionAuthority {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department: string | null;

  @Column({ name: 'max_discount_percent', type: 'real', default: 100, nullable: true })
  maxDiscountPercent: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true, nullable: true })
  isActive: boolean | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
