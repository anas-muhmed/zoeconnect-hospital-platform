import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicPatient } from './eic-patient.entity';
import { EicTherapyTeamMember } from './eic-therapy-team-member.entity';
import { EicAssessment } from './eic-assessment.entity';
import { EicGoal } from './eic-goal.entity';
import { EicTherapySession } from './eic-therapy-session.entity';
import { EicProgressReport } from './eic-progress-report.entity';
import { EicDischargeSummary } from './eic-discharge-summary.entity';
import { EicEnrollmentStatus } from '../common/enums/enrollment-status.enum';
import { EicDiscipline } from '../common/enums/discipline.enum';

@Entity('eic_therapy_enrollments')
export class EicTherapyEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'enrollment_number', type: 'varchar', length: 30, unique: true })
  enrollmentNumber: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicEnrollmentStatus,
    default: EicEnrollmentStatus.INITIATED,
  })
  status: EicEnrollmentStatus;

  @Column({ name: 'admission_date', type: 'date' })
  admissionDate: string;

  @Column({ name: 'discharge_date', type: 'date', nullable: true })
  dischargeDate: string | null;

  @Column({ name: 'active_disciplines', type: 'jsonb', default: [] })
  activeDisciplines: EicDiscipline[];

  @Column({ name: 'primary_diagnosis', type: 'text', nullable: true })
  primaryDiagnosis: string | null;

  @Column({ name: 'referral_source', type: 'varchar', length: 200, nullable: true })
  referralSource: string | null;

  @Column({ name: 'centre_head_id', type: 'uuid', nullable: true })
  centreHeadId: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Central FK target
   * for 6 child tables; tenant is derivable via patient_id → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => EicPatient, (p) => p.enrollments)
  @JoinColumn({ name: 'patient_id' })
  patient: EicPatient;

  @OneToMany(() => EicTherapyTeamMember, (t) => t.enrollment)
  teamMembers: EicTherapyTeamMember[];

  @OneToMany(() => EicAssessment, (a) => a.enrollment)
  assessments: EicAssessment[];

  @OneToMany(() => EicGoal, (g) => g.enrollment)
  goals: EicGoal[];

  @OneToMany(() => EicTherapySession, (s) => s.enrollment)
  sessions: EicTherapySession[];

  @OneToMany(() => EicProgressReport, (r) => r.enrollment)
  progressReports: EicProgressReport[];

  @OneToMany(() => EicDischargeSummary, (d) => d.enrollment)
  dischargeSummaries: EicDischargeSummary[];
}
