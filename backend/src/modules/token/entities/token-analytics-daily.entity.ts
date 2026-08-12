import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * TokenAnalyticsDaily --- pre-aggregated daily analytics per location or service center.
 *
 * Populated by a nightly cron job (TokenAnalyticsCron) that aggregates token_records.
 * One row per (branch_id, reference_type, reference_id, analytics_date).
 */
@Entity('token_analytics_daily')
export class TokenAnalyticsDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  /** LOCATION or SERVICE_CENTER */
  @Column({ name: 'reference_type', length: 20 })
  referenceType: string;

  @Column({ name: 'reference_id', length: 60 })
  referenceId: string;

  @Column({ name: 'analytics_date', type: 'date' })
  analyticsDate: string;

  @Column({ name: 'total_issued', type: 'int', default: 0 })
  totalIssued: number;

  @Column({ name: 'total_called', type: 'int', default: 0 })
  totalCalled: number;

  @Column({ name: 'total_completed', type: 'int', default: 0 })
  totalCompleted: number;

  @Column({ name: 'total_missed', type: 'int', default: 0 })
  totalMissed: number;

  @Column({ name: 'total_cancelled', type: 'int', default: 0 })
  totalCancelled: number;

  @Column({ name: 'total_on_hold', type: 'int', default: 0 })
  totalOnHold: number;

  /** Average wait time (issued_at --- called_at) in seconds */
  @Column({ name: 'avg_wait_seconds', type: 'int', nullable: true })
  avgWaitSeconds: number | null;

  /** Average serve time (called_at --- completed_at) in seconds */
  @Column({ name: 'avg_serve_seconds', type: 'int', nullable: true })
  avgServeSeconds: number | null;

  /** Hour of day (0-23) with highest volume */
  @Column({ name: 'peak_hour', type: 'smallint', nullable: true })
  peakHour: number | null;

  @Column({ name: 'peak_hour_volume', type: 'int', nullable: true })
  peakHourVolume: number | null;

  /** e.g. {"WALK_IN": 120, "VIP": 5, "EMERGENCY": 2} */
  @Column({ name: 'by_type', type: 'jsonb', default: {} })
  byType: Record<string, number>;

  /** e.g. {"1": {called: 40, completed: 38}, "2": {...}} */
  @Column({ name: 'by_counter', type: 'jsonb', default: {} })
  byCounter: Record<string, { called: number; completed: number }>;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Stage B's
   * nightly aggregation job (TokenAnalyticsService) will need to thread
   * tenant_id through both its source filter and this output row.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
