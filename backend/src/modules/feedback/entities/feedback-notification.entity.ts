import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type FeedbackNotificationType = 'NEW_COMPLAINT';

/**
 * FeedbackNotification --- lightweight in-app "something needs your
 * attention" feed for hospital staff, scoped to this module rather than
 * hooking into any platform-wide notification bell (none exists -- see
 * module memory's research note on ZoeConnect's NotificationModule being
 * WhatsApp-only/outbound-to-patients, with no in-app concept at all).
 * Deliberately self-contained: a Complaints-page badge + list, not a
 * cross-module feature. Only one type today (a new complaint arrived);
 * the `type` column exists so a later event (e.g. a submission's rating
 * crossing some alert threshold) doesn't need a schema change.
 */
@Entity('feedback_notifications')
export class FeedbackNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: FeedbackNotificationType;

  @Column({ type: 'uuid', name: 'complaint_id', nullable: true })
  complaintId: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A12) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
