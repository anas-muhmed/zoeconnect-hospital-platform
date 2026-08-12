import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A).
 *
 * Ports `body_types` (MLC / Non-MLC). Verified against the source
 * migrations: this is the ONE Mortuary table that was never given a
 * `hospital_id` column in `002_add_columns.sql` — it's a genuine global
 * reference lookup, not tenant data. Deliberately NOT tenant-scoped here
 * (no `tenantId` column, and Stage D must NOT wrap this in
 * `TenantScopedRepository` — a plain repository/`createSystemQueryBuilder()`
 * pattern applies instead, same as any other cross-tenant reference table).
 */
@Entity('mortuary_body_types')
export class MortuaryBodyType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
