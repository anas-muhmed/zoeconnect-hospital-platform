import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

/**
 * Outcome of a single (employeeCode, dutyDate) comparison between
 * ZoeConnect's computed decision and what Oracle DUTYACTUALVALUES contains.
 */
export type DivergenceOutcome =
  | 'HIS_CONFIRMED'   // ZoeConnect and HIS agree — no action needed
  | 'HIS_DIVERGED'    // ZoeConnect and HIS disagree — strategy applied
  | 'HDSP_ONLY'       // ZoeConnect has a decision but HIS has no row for this date/employee
  | 'HIS_ONLY';       // HIS has a row but ZoeConnect has no snapshot (never processed)

/**
 * Which reconciliation strategy was applied when a divergence was detected.
 * Null when outcome is HIS_CONFIRMED (no divergence).
 */
export type ReconciliationStrategy = 'ACCEPT_HIS' | 'ACCEPT_HDSP' | 'ALERT_ONLY';

/**
 * AttendanceDivergenceLog — Phase 4
 *
 * One row per (employeeCode, dutyDate) comparison performed by HisReconciliationJob.
 * Written for every employee checked — both matches (HIS_CONFIRMED) and mismatches
 * (HIS_DIVERGED) — giving a full audit trail of each reconciliation run.
 */
@Entity('attendance_divergence_logs')
@Index(['employeeCode', 'dutyDate'])
@Index(['dutyDate', 'outcome'])
@Index(['reconciledAt'])
export class AttendanceDivergenceLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 40 })
  employeeCode: string;

  @Column({ name: 'duty_date', type: 'date' })
  dutyDate: Date;

  /** What ZoeConnect's DependencySnapshot said the decision was (null = HDSP_ONLY or no snapshot). */
  @Column({ name: 'hdsp_decision', type: 'varchar', length: 50, nullable: true })
  hdspDecision: string | null;

  /** What Oracle DUTYACTUALVALUES.ATTENDANCE contained (null = HIS had no row). */
  @Column({ name: 'his_attendance', type: 'varchar', length: 50, nullable: true })
  hisAttendance: string | null;

  /** Result of the comparison. */
  @Column({ name: 'outcome', type: 'varchar', length: 20 })
  outcome: DivergenceOutcome;

  /** Strategy applied (null for HIS_CONFIRMED). */
  @Column({ name: 'strategy_applied', type: 'varchar', length: 20, nullable: true })
  strategyApplied: ReconciliationStrategy | null;

  /** Timestamp of the reconciliation run that produced this log row. */
  @Column({ name: 'reconciled_at', type: 'timestamptz' })
  reconciledAt: Date;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). No Postgres join
   * can derive tenant here (employee identity lives in Oracle HIS).
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
