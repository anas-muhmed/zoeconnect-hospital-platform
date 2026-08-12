import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { EicDischargeSummary } from './eic-discharge-summary.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { EicSectionStatus } from '../common/enums/assessment-status.enum';

@Entity('eic_discharge_sections')
export class EicDischargeSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'discharge_id', type: 'uuid' })
  dischargeId: string;

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

  @Column({ name: 'total_sessions', type: 'smallint', nullable: true })
  totalSessions: number | null;

  @Column({ name: 'goals_achieved', type: 'smallint', nullable: true })
  goalsAchieved: number | null;

  @Column({ name: 'functional_outcomes', type: 'text', nullable: true })
  functionalOutcomes: string | null;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ name: 'section_data', type: 'jsonb', nullable: true, default: {} })
  sectionData: Record<string, unknown>;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via discharge_id → eic_discharge_summaries → eic_patients.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EicDischargeSummary, (d) => d.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discharge_id' })
  discharge: EicDischargeSummary;
}
