import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicDisciplineProgressSection } from './eic-discipline-progress-section.entity';
import { EicReportStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_progress_reports')
export class EicProgressReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'report_number', type: 'smallint', default: 1 })
  reportNumber: number;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicReportStatus,
    default: EicReportStatus.IN_PROGRESS,
  })
  status: EicReportStatus;

  @Column({ name: 'signed_by', type: 'uuid', nullable: true })
  signedBy: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'signatory_name', type: 'varchar', length: 200, nullable: true })
  signatoryName: string | null;

  @Column({ name: 'signatory_designation', type: 'varchar', length: 200, nullable: true })
  signatoryDesignation: string | null;

  @Column({ name: 'initiated_by', type: 'uuid', nullable: true })
  initiatedBy: string | null;

  /** Deadline for therapists to submit their sections */
  @Column({ name: 'sections_due_date', type: 'date', nullable: true })
  sectionsDueDate: string | null;

  /** Deadline for Centre Head to obtain signature */
  @Column({ name: 'report_due_date', type: 'date', nullable: true })
  reportDueDate: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via enrollment_id → eic_therapy_enrollments → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicTherapyEnrollment, (e) => e.progressReports)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;

  @OneToMany(() => EicDisciplineProgressSection, (s) => s.progressReport)
  sections: EicDisciplineProgressSection[];
}
