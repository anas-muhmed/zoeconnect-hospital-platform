import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';
import type { AttendanceProcessingMode, SkipReason } from '../attendance.types';

/**
 * AttendanceSkipLog — Phase 5
 *
 * Immutable audit record written every time a recalculation write is blocked
 * by the governance gate. Answers: "why was this employee-date not updated?"
 *
 * skipReason values:
 *   PAYROLL_LOCKED      — active governance lock covers this employee+date
 *   MANUAL_OVERRIDE     — DUTYACTUALVALUES.REMARKS does not start with 'ZoeConnect realtime:'
 *   ALREADY_UP_TO_DATE  — computed decision matches current stored value
 *   INVALID_DEPENDENCY  — dependency event was malformed / had no blast radius
 *   DUPLICATE_EVENT     — same (employeeCode, dutyDate) already enqueued in this batch
 */
@Entity('attendance_skip_logs')
@Index(['employeeCode', 'dutyDate'])
@Index(['skipReason', 'skippedAt'])
@Index(['skippedAt'])
export class AttendanceSkipLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 40 })
  employeeCode: string;

  @Column({ name: 'duty_date', type: 'date' })
  dutyDate: Date;

  @Column({ name: 'skip_reason', type: 'varchar', length: 40 })
  skipReason: SkipReason;

  @Column({ name: 'mode', type: 'varchar', length: 30 })
  mode: AttendanceProcessingMode;

  /** The attendance_events row that triggered processing (may be null for retroactive batch items) */
  @Column({ name: 'attendance_event_id', type: 'uuid', nullable: true })
  attendanceEventId: string | null;

  /** The dependency event that triggered the recalculation (if applicable) */
  @Column({ name: 'dependency_event_id', type: 'uuid', nullable: true })
  dependencyEventId: string | null;

  @Column({ name: 'skipped_at', type: 'timestamptz' })
  skippedAt: Date;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

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
