import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import type { AttendanceDecisionStatus, AttendanceProcessingMode } from '../attendance.types';

@Entity('attendance_audit')
@Index(['employeeCode', 'dutyDate'])
@Index(['eventId'])
@Index(['createdAt'])
export class AttendanceAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId: string | null;

  @Column({ name: 'employee_code', type: 'varchar', length: 40 })
  employeeCode: string;

  @Column({ name: 'duty_date', type: 'date' })
  dutyDate: string;

  @Column({ name: 'mode', type: 'varchar', length: 30 })
  mode: AttendanceProcessingMode;

  @Column({ name: 'old_status', type: 'varchar', length: 40, nullable: true })
  oldStatus: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 40 })
  newStatus: AttendanceDecisionStatus;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, unknown> | null;

  @Column({ name: 'new_value', type: 'jsonb' })
  newValue: Record<string, unknown>;

  @Column({ name: 'reason_code', type: 'varchar', length: 80 })
  reasonCode: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). No Postgres join
   * can derive tenant here (employee identity lives in Oracle HIS) — see
   * HYBRID_ARCHITECTURE_LOG.md's A9 relationship audit.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

