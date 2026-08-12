import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Hospital } from './hospital.entity';

/**
 * Stores general operational settings per hospital (e.g., Session Timeout).
 * Part of Workstream 3: Enterprise Configuration Platform.
 */
@Entity('hospital_settings')
@Index(['hospitalId', 'settingKey'], { unique: true })
export class HospitalSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @ManyToOne(() => Hospital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  /** Dot-notation key, e.g. "security.idleTimeoutMinutes" */
  @Column({ name: 'setting_key', type: 'varchar', length: 100 })
  settingKey: string;

  /** Stored as JSON string to support booleans, numbers, and strings natively */
  @Column({ name: 'setting_value', type: 'text' })
  settingValue: string;

  /** Human-readable label shown in the UI */
  @Column({ name: 'label', type: 'varchar', length: 150 })
  label: string;

  /** Optional hint shown under the input field */
  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
