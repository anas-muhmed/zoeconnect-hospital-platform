import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicDischargeSection } from './eic-discharge-section.entity';
import { EicDischargeStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_discharge_summaries')
export class EicDischargeSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid', unique: true })
  enrollmentId: string;

  @Column({ name: 'discharge_reason', type: 'varchar', length: 100 })
  dischargeReason: string;

  @Column({ name: 'discharge_date', type: 'date' })
  dischargeDate: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicDischargeStatus,
    default: EicDischargeStatus.DRAFT,
  })
  status: EicDischargeStatus;

  @Column({ name: 'overall_progress', type: 'text', nullable: true })
  overallProgress: string | null;

  @Column({ name: 'home_programme', type: 'text', nullable: true })
  homeProgramme: string | null;

  @Column({ name: 'follow_up_plan', type: 'text', nullable: true })
  followUpPlan: string | null;

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

  @ManyToOne(() => EicTherapyEnrollment, (e) => e.dischargeSummaries)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: EicTherapyEnrollment;

  @OneToMany(() => EicDischargeSection, (s) => s.discharge)
  sections: EicDischargeSection[];
}
