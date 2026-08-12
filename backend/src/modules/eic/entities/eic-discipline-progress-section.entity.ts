import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { EicProgressReport } from './eic-progress-report.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { EicSectionStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_discipline_progress_sections')
export class EicDisciplineProgressSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'progress_report_id', type: 'uuid' })
  progressReportId: string;

  @Column({ name: 'discipline', type: 'enum', enum: EicDiscipline })
  discipline: EicDiscipline;

  @Column({ name: 'therapist_id', type: 'varchar', length: 100, nullable: true })
  therapistId: string | null;

  @Column({ name: 'therapist_name', type: 'varchar', length: 200, nullable: true })
  therapistName: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EicSectionStatus,
    default: EicSectionStatus.PENDING,
  })
  status: EicSectionStatus;

  @Column({ name: 'sessions_held', type: 'smallint', nullable: true })
  sessionsHeld: number | null;

  @Column({ name: 'goals_achieved', type: 'smallint', nullable: true })
  goalsAchieved: number | null;

  @Column({ name: 'goals_in_progress', type: 'smallint', nullable: true })
  goalsInProgress: number | null;

  @Column({ name: 'goals_carried', type: 'smallint', nullable: true })
  goalsCarried: number | null;

  @Column({ name: 'functional_progress', type: 'text', nullable: true })
  functionalProgress: string | null;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ name: 'next_period_goals', type: 'text', nullable: true })
  nextPeriodGoals: string | null;

  @Column({ name: 'section_data', type: 'jsonb', nullable: true, default: {} })
  sectionData: Record<string, unknown>;

  /** Name snapshot at submission time — point-in-time attestation, not a live reference */
  @Column({ name: 'submitted_by_name', type: 'varchar', length: 200, nullable: true })
  submittedByName: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via progress_report_id → eic_progress_reports → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicProgressReport, (r) => r.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'progress_report_id' })
  progressReport: EicProgressReport;
}
