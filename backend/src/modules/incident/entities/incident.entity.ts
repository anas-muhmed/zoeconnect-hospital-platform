import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn, VersionColumn
} from 'typeorm';
import { IncidentCategory } from './incident-category.entity';
import { IncidentType } from './incident-type.entity';

/**
 * Incident — the primary entity for the Incident Management module.
 *
 * Incident Number: generated as {HOSPITAL_CODE}-{YYYY}-INC-{NNNNNN}.
 * Hospital code is read from the system_settings table key
 * 'incident.hospital_code' at creation time (defaults to 'INC').
 * Example: KIMS-2026-INC-000012
 *
 * Residual Risk (NABH/JCI accreditation):
 *   - riskScore/riskLevel: initial risk assessment at time of report
 *   - residualRiskScorePreCapa/Level: re-assessed after investigation
 *   - residualRiskScorePostCapa/Level: re-assessed after CAPA completion
 *
 * SLA fields are computed by IncidentSlaService at creation/severity-change
 * time using the IncidentSeverityLevel's sla_* columns.
 *
 * patientSnapshot: JSON snapshot of patient data at time of report.
 * Stored to preserve historical accuracy even if HIS data changes.
 * Retrieved via PatientService.getByMrn() (Redis-cached, Oracle-backed).
 */
@Entity('incidents')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'severityCode'])
@Index(['tenantId', 'categoryId'])
@Index(['tenantId', 'department'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'leadInvestigatorId'])
@Index(['tenantId', 'incidentDate'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_number', type: 'varchar', length: 50 })
  incidentNumber: string;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => IncidentCategory)
  @JoinColumn({ name: 'category_id' })
  category: IncidentCategory;

  @Column({ name: 'type_id', type: 'uuid', nullable: true })
  typeId: string | null;

  @ManyToOne(() => IncidentType)
  @JoinColumn({ name: 'type_id' })
  type: IncidentType;

  @Column({ name: 'severity_code', type: 'varchar', length: 20, default: 'LOW' })
  severityCode: string;

  @Column({ name: 'priority_code', type: 'varchar', length: 20, default: 'ROUTINE' })
  priorityCode: string;

  // ── Risk Assessment (initial) ─────────────────────────────────────────────
  @Column({ name: 'risk_score', type: 'smallint', nullable: true })
  riskScore: number | null;

  @Column({ name: 'risk_level', type: 'varchar', length: 20, nullable: true })
  riskLevel: string | null;

  // ── Residual Risk (NABH/JCI accreditation) ───────────────────────────────
  @Column({ name: 'residual_risk_score_pre_capa', type: 'smallint', nullable: true })
  residualRiskScorePreCapa: number | null;

  @Column({ name: 'residual_risk_level_pre_capa', type: 'varchar', length: 20, nullable: true })
  residualRiskLevelPreCapa: string | null;

  @Column({ name: 'residual_risk_score_post_capa', type: 'smallint', nullable: true })
  residualRiskScorePostCapa: number | null;

  @Column({ name: 'residual_risk_level_post_capa', type: 'varchar', length: 20, nullable: true })
  residualRiskLevelPostCapa: string | null;

  // ── Timing ────────────────────────────────────────────────────────────────
  @Column({ name: 'incident_date', type: 'timestamptz' })
  incidentDate: Date;

  @Column({ name: 'reported_at', type: 'timestamptz', default: () => 'NOW()' })
  reportedAt: Date;

  // ── Location ─────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 100 })
  department: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ward: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  // ── People ────────────────────────────────────────────────────────────────
  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @Column({ name: 'lead_investigator_id', type: 'uuid', nullable: true })
  leadInvestigatorId: string | null;

  // ── Patient (HIS lookup, nullable — not all incidents involve patients) ───
  @Column({ name: 'patient_mrn', type: 'varchar', length: 50, nullable: true })
  patientMrn: string | null;

  @Column({ name: 'patient_snapshot', type: 'jsonb', nullable: true })
  patientSnapshot: Record<string, unknown> | null;

  // ── Employee (for staff injury, etc.) ────────────────────────────────────
  @Column({ name: 'employee_id', type: 'varchar', length: 100, nullable: true })
  employeeId: string | null;

  // ── Description ──────────────────────────────────────────────────────────
  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'immediate_action', type: 'text', nullable: true })
  immediateAction: string | null;

  @Column({ name: 'current_stage', type: 'varchar', length: 30, default: 'REPORTING' })
  currentStage: string;

  // ── Flags ────────────────────────────────────────────────────────────────
  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @Column({ name: 'is_near_miss', default: false })
  isNearMiss: boolean;

  @Column({ name: 'is_sentinel_event', default: false })
  isSentinelEvent: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  tags: string[];

  // ── SLA tracking ─────────────────────────────────────────────────────────
  @Column({ name: 'sla_response_due', type: 'timestamptz', nullable: true })
  slaResponseDue: Date | null;

  @Column({ name: 'sla_investigation_due', type: 'timestamptz', nullable: true })
  slaInvestigationDue: Date | null;

  @Column({ name: 'sla_capa_due', type: 'timestamptz', nullable: true })
  slaCapaDue: Date | null;

  @Column({ name: 'sla_closure_due', type: 'timestamptz', nullable: true })
  slaClosureDue: Date | null;

  @Column({ name: 'sla_response_breached', default: false })
  slaResponseBreached: boolean;

  @Column({ name: 'sla_investigation_breached', default: false })
  slaInvestigationBreached: boolean;

  @Column({ name: 'sla_capa_breached', default: false })
  slaCapaBreached: boolean;

  @Column({ name: 'sla_closure_breached', default: false })
  slaClosureBreached: boolean;

  // ── Audit ─────────────────────────────────────────────────────────────────
  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
