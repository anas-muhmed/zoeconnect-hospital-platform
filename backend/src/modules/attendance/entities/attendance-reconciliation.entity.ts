import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('attendance_reconciliation')
@Index(['runDate', 'status'])
export class AttendanceReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_date', type: 'date' })
  runDate: string;

  @Column({ name: 'from_datetime', type: 'timestamptz' })
  fromDateTime: Date;

  @Column({ name: 'to_datetime', type: 'timestamptz' })
  toDateTime: Date;

  @Column({ name: 'status', type: 'varchar', length: 30 })
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';

  @Column({ name: 'processed_count', type: 'int', default: 0 })
  processedCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A9) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). System-owned job
   * run-log today; may become tenant-scoped once reconciliation runs
   * per-tenant.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

