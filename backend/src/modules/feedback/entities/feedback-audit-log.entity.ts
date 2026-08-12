import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type FeedbackAuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE' | 'CLONE';

/**
 * FeedbackAuditLog --- immutable audit trail for the Feedback module.
 *
 * Deliberately a dedicated table (mirrors CMSAuditLog / cms_audit_logs),
 * NOT the shared `@Audit()` decorator + AuditInterceptor + `audit_logs`
 * table used by most other ZoeConnect modules -- that mechanism turned out to be
 * dead code (AuditInterceptor sets `request.auditEvent` but nothing reads
 * it or emits the 'audit.log' event its own comment describes, and it's
 * never registered as a global interceptor in app.module.ts/main.ts, so
 * every controller using `@Audit(...)` today silently logs nothing). Rather
 * than depend on that broken plumbing -- or fix a platform-wide gap as a
 * side effect of this module -- Feedback uses the same proven, directly-
 * called pattern CMS already uses successfully. Rows are append-only.
 */
@Entity('feedback_audit_logs')
export class FeedbackAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  /** e.g. 'feedback_form', 'feedback_section', 'feedback_question' */
  @Column({ type: 'varchar', name: 'entity_type', length: 60 })
  entityType: string;

  @Column({ type: 'varchar', name: 'entity_id', length: 100, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 30 })
  action: FeedbackAuditAction;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** user.id or 'system' */
  @Column({ type: 'varchar', name: 'changed_by', length: 100 })
  changedBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Written from both
   * authenticated admin actions and the anonymous public endpoint
   * (changed_by = 'public' for the latter) — same server-side-derivation
   * requirement as FeedbackSubmission for the public-triggered rows.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
