import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'ENABLE' | 'DISABLE' | 'RESET' | 'MIGRATE';

/**
 * TokenAuditLog --- immutable audit trail for all token module configuration changes.
 *
 * Written on every create/update/delete/archive of:
 *   token_branch_config, token_kiosks, token_kiosk_assignments,
 *   token_sc_configs, token_locations, token_counters, display_pages
 *
 * Rows are never updated or deleted (append-only for compliance).
 */
@Entity('token_audit_logs')
export class TokenAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  /** Table / domain name, e.g. 'token_kiosk', 'token_branch_config' */
  @Column({ name: 'entity_type', length: 60 })
  entityType: string;

  /** Primary key of the changed row (as string) */
  @Column({ type: 'varchar', name: 'entity_id', length: 100, nullable: true })
  entityId: string | null;

  @Column({ length: 30 })
  action: AuditAction;

  /** user.id or 'system' for cron jobs */
  @Column({ name: 'changed_by', length: 100 })
  changedBy: string;

  @Column({ name: 'changed_at', type: 'timestamptz', default: () => 'NOW()' })
  changedAt: Date;

  /** Snapshot of the row before the change (null for CREATE) */
  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  /** Snapshot of the row after the change (null for DELETE) */
  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ type: 'varchar', name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
