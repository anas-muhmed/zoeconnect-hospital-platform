import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Hospital } from './hospital.entity';

/**
 * Stores the live Oracle HIS table/column name mappings per hospital.
 *
 * Each row = one config key (e.g. "billing.table") mapped to the real
 * Oracle identifier for that hospital (e.g. "BILL_MASTER").
 *
 * config_type:
 *   TABLE        — Oracle table name
 *   COLUMN       — Oracle column name
 *   STATUS_VALUE — A status string value stored in Oracle (e.g. 'FINALISED')
 */
@Entity('his_schema_configs')
@Index(['hospitalId', 'configKey'], { unique: true })
export class HisSchemaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @ManyToOne(() => Hospital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  /** Dot-notation key, e.g. "billing.table", "patient.col.mrn" */
  @Column({ name: 'config_key', type: 'varchar', length: 100 })
  configKey: string;

  /** The real Oracle identifier or status value for this hospital (text for SQL_QUERY entries) */
  @Column({ name: 'config_value', type: 'text' })
  configValue: string;

  /** Placeholder / default value used when no mapping is saved */
  @Column({ name: 'default_value', type: 'text' })
  defaultValue: string;

  /** Human-readable label shown in the UI */
  @Column({ name: 'label', type: 'varchar', length: 150 })
  label: string;

  /** Optional hint shown under the input field */
  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  /** TABLE | COLUMN | STATUS_VALUE | SQL_QUERY | TEXT | CREDENTIAL */
  @Column({ name: 'config_type', type: 'varchar', length: 20 })
  configType: 'TABLE' | 'COLUMN' | 'STATUS_VALUE' | 'SQL_QUERY' | 'TEXT' | 'CREDENTIAL';

  /** DB_CONNECTION | PATIENT | BILLING | BILL_ITEMS | VISIT | DEPARTMENT | DOCTOR | SQL_QUERIES */
  @Column({ name: 'category', type: 'varchar', length: 30 })
  category: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
