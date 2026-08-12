import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * A named, reusable set of raw Oracle SQL queries for all 8 HIS query types.
 * Admins save one template per hospital "profile" and apply it to new hospitals
 * without rewriting SQL from scratch.
 *
 * queries: JSON map of sql.* config key → SQL string, e.g.
 *   { "sql.patient.getByMrn": "SELECT ...", "sql.patient.search": "SELECT ..." }
 */
@Entity('his_config_templates')
export class HisConfigTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** All 8 sql.* query strings keyed by config key */
  @Column({ type: 'jsonb', default: '{}' })
  queries: Record<string, string>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
