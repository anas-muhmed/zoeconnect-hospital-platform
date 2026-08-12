import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn,
} from 'typeorm';
import { EicPatient } from './eic-patient.entity';
import { EicPreschoolAssessment } from './eic-preschool-assessment.entity';
import { EicPreschoolDailyReport } from './eic-preschool-daily-report.entity';

@Entity('eic_preschool_enrollments')
export class EicPreschoolEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'enrollment_number', type: 'varchar', length: 30, unique: true })
  enrollmentNumber: string;

  @Column({ name: 'admission_date', type: 'date' })
  admissionDate: string;

  @Column({ name: 'discharge_date', type: 'date', nullable: true })
  dischargeDate: string | null;

  @Column({ name: 'class_group', type: 'varchar', length: 50, nullable: true })
  classGroup: string | null;

  @Column({ name: 'teacher_id', type: 'varchar', length: 100, nullable: true })
  teacherId: string | null;

  @Column({ name: 'teacher_name', type: 'varchar', length: 200, nullable: true })
  teacherName: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via patient_id → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicPatient, (p) => p.preschoolEnrollments)
  @JoinColumn({ name: 'patient_id' })
  patient: EicPatient;

  @OneToOne(() => EicPreschoolAssessment, (a) => a.preschoolEnrollment)
  assessment: EicPreschoolAssessment;

  @OneToMany(() => EicPreschoolDailyReport, (r) => r.preschoolEnrollment)
  dailyReports: EicPreschoolDailyReport[];
}
