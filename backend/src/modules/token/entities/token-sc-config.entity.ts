import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * TokenScConfig --- per-service-center configuration for SERVICE_CENTER_BASED branches.
 *
 * Each configured SC can have:
 *   - A custom token prefix (e.g. "R" for Radiology --- R-001)
 *   - Its own start number and max number
 *   - Daily reset toggle
 *
 * branch_id + service_center_id is unique --- one config row per SC per branch.
 */
@Entity('token_sc_configs')
export class TokenScConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  @Column({ name: 'department_id', length: 30 })
  departmentId: string;

  @Column({ name: 'department_name', length: 255 })
  departmentName: string;

  @Column({ name: 'service_center_id', length: 30 })
  serviceCenterId: string;

  @Column({ name: 'service_center_name', length: 255 })
  serviceCenterName: string;

  @Column({ type: 'varchar', name: 'intrabranchid', length: 30, nullable: true })
  intrabranchId: string | null;

  /** Token prefix printed on the slip, e.g. "R" for Radiology --- R-001 */
  @Column({ name: 'token_prefix', length: 10, default: '' })
  tokenPrefix: string;

  @Column({ name: 'start_number', type: 'int', default: 1 })
  startNumber: number;

  @Column({ name: 'max_number', type: 'int', default: 999 })
  maxNumber: number;

  @Column({ name: 'reset_daily', default: true })
  resetDaily: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Note for Stage
   * B: a pre-existing, unrelated raw-SQL bug was found during this
   * checkpoint's audit — TokenSequenceService.manualResetSequences
   * references this table as "token_sc_config" (singular) instead of
   * "token_sc_configs", silently defeating configured start numbers on
   * bulk sequence reset. Flagged for separate follow-up, not fixed here.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
