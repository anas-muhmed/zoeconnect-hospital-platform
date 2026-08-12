import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Hospital } from './hospital.entity';

export type HdspUserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

/**
 * Credentials for ZoeConnect local user accounts, managed by the vendor.
 * When "Push to Hospital" is triggered, these are included in the webhook
 * payload so ZoeConnect can provision / update the user in its own users table.
 */
@Entity('hdsp_users')
@Index(['hospitalId', 'username'], { unique: true })
export class HdspUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @ManyToOne(() => Hospital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @Column({ type: 'varchar', length: 64 })
  username: string;

  /** bcrypt hash of the password — stored here so it can be pushed to ZoeConnect */
  @Column({ name: 'password_hash', type: 'varchar', length: 128 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32, default: 'STAFF' })
  role: HdspUserRole;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
