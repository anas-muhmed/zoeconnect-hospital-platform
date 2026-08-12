import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { NotificationChannel, NotificationEventType } from '../notification.types';

/**
 * Stores the Meta-registered template names & expected parameter descriptions.
 * The actual message content lives on Meta's side; we store just enough to
 * know which template to send for which event and what params to pass.
 */
@Entity('notification_templates')
@Index(['eventType', 'channel'], { unique: true })
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable label, e.g. "Welcome Message" */
  @Column({ length: 120 })
  name: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A5) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** Triggers this template (maps event → template) */
  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: NotificationEventType;

  /** Delivery channel this template is for */
  @Column({ name: 'channel', type: 'varchar', length: 20 })
  channel: NotificationChannel;

  /**
   * The exact template name registered on Meta Business Manager.
   * WhatsApp requires pre-approved template names.
   */
  @Column({ name: 'template_name', length: 120 })
  templateName: string;

  /** BCP 47 language code, defaults to en_US */
  @Column({ name: 'language_code', length: 10, default: 'en_US' })
  languageCode: string;

  /**
   * Human-readable description of each ordered parameter, e.g.:
   * ["Patient name", "Points earned", "Total balance"]
   * Used by the UI to show what data maps to which {{1}} placeholder.
   */
  @Column({ name: 'param_descriptions', type: 'jsonb', default: [] })
  paramDescriptions: string[];

  /** A preview of the message body for reference (not sent to Meta) */
  @Column({ name: 'body_preview', type: 'text', nullable: true })
  bodyPreview: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
