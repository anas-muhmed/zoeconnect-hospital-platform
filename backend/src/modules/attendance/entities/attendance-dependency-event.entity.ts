import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { DependencySource, DependencyEventScope } from '../events/attendance-dependency-changed.event';

export type DependencyEventStatus = 'PENDING' | 'ROUTED' | 'DEBOUNCED' | 'SKIPPED' | 'FAILED';

@Entity('attendance_dependency_events')
@Index(['source', 'status', 'createdAt'])
@Index(['employeeCode', 'dutyDate'])
@Index(['correlationId'])
export class AttendanceDependencyEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source', type: 'varchar', length: 30 })
  source: DependencySource;

  /** Blast-radius scope: EMPLOYEE | GLOBAL | CONFIG. Nullable for pre-2B rows. */
  @Column({ name: 'scope', type: 'varchar', length: 20, nullable: true })
  scope: DependencyEventScope | null;

  @Column({ name: 'employee_code', type: 'varchar', length: 40, nullable: true })
  employeeCode: string | null;

  @Column({ name: 'duty_date', type: 'date', nullable: true })
  dutyDate: Date | null;

  @Column({ name: 'triggered_at', type: 'timestamptz' })
  triggeredAt: Date;

  /** PENDING | DEBOUNCED | ROUTED | SKIPPED | FAILED */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: DependencyEventStatus;

  @Column({ name: 'payload', type: 'jsonb', default: '{}' })
  payload: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64 })
  correlationId: string;

  /** When DEBOUNCED events may be promoted to PENDING. Null for non-DUTY_PLAN. */
  @Column({ name: 'debounce_until', type: 'timestamptz', nullable: true })
  debounceUntil: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). scope=EMPLOYEE
   * rows are tenant-owned but unresolvable via local join; scope=GLOBAL
   * (holiday) / CONFIG (shift-type) rows are genuinely ownerless by
   * design and need an explicit Stage B policy decision, not derivation.
   * Highest-volume table in the module (~156k rows measured pre-migration)
   * — backfilled via its own isolated migration
   * (1783780000001-AddTenantIdToAttendanceDependencyEvents.ts), separate
   * from the other 8 low-volume Attendance tables.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
