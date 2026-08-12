import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';
import type { AttendanceDecisionStatus, AttendanceProcessingMode } from '../attendance.types';

/**
 * AttendanceDependencySnapshot — Phase 4
 *
 * Records ZoeConnect's last computed attendance decision for each (employeeCode, dutyDate)
 * pair. Written by DependencySnapshotService every time AttendanceProcessor
 * successfully evaluates a decision.
 *
 * Used by HisReconciliationJob (03:30) to compare ZoeConnect's computed value against
 * Oracle DUTYACTUALVALUES, detect divergences, and apply the configured strategy.
 *
 * UNIQUE constraint on (employee_code, duty_date) — only one snapshot per pair;
 * re-processing the same date upserts (overwrites) the existing row.
 */
@Entity('attendance_dependency_snapshots')
@Unique(['employeeCode', 'dutyDate'])
@Index(['dutyDate'])
@Index(['capturedAt'])
export class AttendanceDependencySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Maps to attendance_events.employee_code. */
  @Column({ name: 'employee_code', type: 'varchar', length: 40 })
  employeeCode: string;

  /** Calendar date of the evaluated duty shift. */
  @Column({ name: 'duty_date', type: 'date' })
  dutyDate: Date;

  /**
   * ZoeConnect's computed decision status at the time of last processing.
   * e.g. 'PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'ON_HOLIDAY', etc.
   */
  @Column({ name: 'hdsp_decision', type: 'varchar', length: 50 })
  hdspDecision: AttendanceDecisionStatus;

  /** Shift code in effect at the time of this decision (for audit). */
  @Column({ name: 'shift_code', type: 'varchar', length: 50, nullable: true })
  shiftCode: string | null;

  /** Processing mode that produced this snapshot (REALTIME / RECONCILIATION / DEPENDENCY_RECALC). */
  @Column({ name: 'processing_mode', type: 'varchar', length: 30 })
  processingMode: AttendanceProcessingMode;

  /** When this snapshot was last written. */
  @Column({ name: 'captured_at', type: 'timestamptz' })
  capturedAt: Date;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). No Postgres join
   * can derive tenant here (employee identity lives in Oracle HIS). Note
   * for Stage B: the raw query-builder UPDATE in his-divergence.service.ts
   * (ACCEPT_HIS strategy) will need explicit tenant scoping once this
   * column is load-bearing.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
