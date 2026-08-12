import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type {
  AttendanceDecisionStatus,
  AttendanceEventStatus,
  PunchDirection,
} from '../attendance.types';

@Entity('attendance_events')
@Index(['employeeCode', 'logDateTime'])
@Index(['status', 'createdAt'])
@Index(['sourceId'], { unique: true })
@Index(['idempotencyKey'])
export class AttendanceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_id', type: 'varchar', length: 160 })
  sourceId: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 220 })
  idempotencyKey: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 40 })
  employeeCode: string;

  @Column({ name: 'log_datetime', type: 'timestamptz' })
  logDateTime: Date;

  @Column({ name: 'device_name', type: 'varchar', length: 120, nullable: true })
  deviceName: string | null;

  @Column({ name: 'direction', type: 'varchar', length: 20, default: 'UNKNOWN' })
  direction: PunchDirection;

  @Column({ name: 'raw_direction', type: 'varchar', length: 60, nullable: true })
  rawDirection: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'NEW' })
  status: AttendanceEventStatus;

  @Column({ name: 'decision_status', type: 'varchar', length: 40, nullable: true })
  decisionStatus: AttendanceDecisionStatus | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Unlike prior
   * checkpoints, no Postgres join can derive tenant here — employee
   * identity lives entirely in Oracle HIS. Stage B must resolve tenant
   * from Oracle's INTRABRANCHID (via RosterResolver) and stamp it at
   * write time, not backfill it via a later join (see
   * HYBRID_ARCHITECTURE_LOG.md's A9 relationship audit).
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
