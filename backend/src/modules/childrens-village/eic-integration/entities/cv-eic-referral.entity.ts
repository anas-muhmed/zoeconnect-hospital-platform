import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';

@Entity('cv_eic_referrals')
@Index('IDX_CV_EIC_REFERRALS_TENANT', ['tenantId', 'studentId'])
export class CvEicReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'referred_by', type: 'uuid' })
  referredBy: string;

  @Column({ name: 'requested_disciplines', type: 'jsonb' })
  // e.g. ['SPEECH_THERAPY', 'OCCUPATIONAL_THERAPY']
  requestedDisciplines: string[];

  @Column({ name: 'reason_for_referral', type: 'text' })
  reasonForReferral: string;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'DRAFT' })
  // e.g. DRAFT, SUBMITTED, IN_REVIEW, ACCEPTED, REJECTED, CANCELLED, CLOSED
  status: string;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  // Array of { status, changedAt, changedBy, remarks }
  statusHistory: any[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;
}
