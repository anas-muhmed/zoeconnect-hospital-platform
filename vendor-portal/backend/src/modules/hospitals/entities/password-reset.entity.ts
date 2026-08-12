import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Hospital } from './hospital.entity';

@Entity('password_reset_requests')
export class PasswordReset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Hospital, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hospital_id' })
  hospital: Hospital;

  @Column({ name: 'hospital_id', type: 'uuid' })
  hospitalId: string;

  @Column({ name: 'vendor_request_id', type: 'varchar', length: 64 })
  vendorRequestId: string;

  @Column({ name: 'username', type: 'varchar', length: 255 })
  username: string;

  @Column({ name: 'reason', type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'REQUESTED' })
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED';

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approval_note', type: 'varchar', nullable: true })
  approvalNote: string | null;

  @Column({ name: 'rejection_reason', type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
