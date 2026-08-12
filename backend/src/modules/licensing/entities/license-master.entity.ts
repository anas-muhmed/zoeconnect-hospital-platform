import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type LicenseStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'TRIAL';

@Entity('license_master')
export class LicenseMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'license_key', type: 'uuid', unique: true })
  licenseKey: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A3) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'hospital_name', length: 255 })
  hospitalName: string;

  @Column({ name: 'hospital_code', length: 50 })
  hospitalCode: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'licensed_modules', type: 'jsonb' })
  licensedModules: string[];

  @Column({ name: 'max_users', default: 50 })
  maxUsers: number;

  @Column({ name: 'machine_fingerprint', type: 'varchar', length: 64, nullable: true })
  machineFingerprint: string | null;

  @Column({ name: 'status', length: 20, default: 'ACTIVE' })
  status: LicenseStatus;

  @Column({ name: 'raw_license', type: 'jsonb' })
  rawLicense: Record<string, unknown>;

  @Column({ name: 'metadata_hash', length: 64 })
  metadataHash: string;

  @Column({ name: 'activated_by', type: 'uuid', nullable: true })
  activatedBy: string | null;

  @CreateDateColumn({ name: 'activated_at' })
  activatedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
