import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Hospital } from './hospital.entity';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Entity('license_requests')
export class LicenseRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Hospital, (h) => h.requests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @Column({ name: 'requested_modules', type: 'jsonb', default: [] })
  requestedModules: string[];

  @Column({ name: 'current_modules', type: 'jsonb', default: [] })
  currentModules: string[];

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'machine_fingerprint', type: 'varchar', length: 64 })
  machineFingerprint: string;

  @Column({ name: 'is_trial', type: 'boolean', default: false })
  isTrial: boolean;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING' })
  status: RequestStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'vendor_notes', type: 'text', nullable: true })
  vendorNotes: string | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'submitted_at' })
  submittedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
