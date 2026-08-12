import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Hospital } from './hospital.entity';

export type LicenseType  = 'TRIAL_EXTENSION' | 'MODULE_LICENSE' | 'PERPETUAL';
export type IssuedStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

@Entity('issued_licenses')
export class IssuedLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Hospital, (h) => h.licenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ name: 'license_type', type: 'varchar', length: 32 })
  licenseType: LicenseType;

  @Column({ name: 'licensed_modules', type: 'jsonb', default: [] })
  licensedModules: string[];

  @Column({ name: 'max_users', type: 'int', default: 50 })
  maxUsers: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'machine_locked', type: 'boolean', default: false })
  machineLocked: boolean;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: IssuedStatus;

  @Column({ name: 'signed_payload', type: 'jsonb' })
  signedPayload: Record<string, unknown>;

  @Column({ name: 'issued_by', type: 'uuid' })
  issuedBy: string;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason: string | null;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
