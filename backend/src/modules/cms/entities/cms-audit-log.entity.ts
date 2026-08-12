import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type CmsAuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'PERMANENT_DELETE'
  | 'PUBLISH' | 'ROLLBACK' | 'ARCHIVE';

/**
 * CMSAuditLog --- immutable audit trail for all CMS configuration and
 * content changes (media, playlists, publishes, displays, schedules).
 * Mirrors the existing TokenAuditLog pattern (token-audit-log.entity.ts)
 * but is a dedicated table -- kept independent from the Token module per
 * the CMS module's overall isolation requirement.
 *
 * Rows are never updated or deleted (append-only for compliance).
 */
@Entity('cms_audit_logs')
export class CMSAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  /** e.g. 'CMSMedia', 'CMSPlaylist', 'CMSDisplayAssignment', 'CMSPlaylistSchedule' */
  @Column({ name: 'entity_type', length: 60 })
  entityType: string;

  @Column({ type: 'varchar', name: 'entity_id', length: 100, nullable: true })
  entityId: string | null;

  @Column({ length: 30 })
  action: CmsAuditAction;

  /** Short human-readable summary, e.g. "Published version 3 (5 items)" */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** user.id or 'system' */
  @Column({ name: 'changed_by', length: 100 })
  changedBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
