import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { NotificationChannel, NotificationStatus, NotificationEventType } from '../notification.types';

@Entity('notification_logs')
@Index(['loyaltyAccountId', 'eventType'])
@Index(['status', 'createdAt'])
@Index(['phone'])
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Destination phone number in E.164 format */
  @Column({ length: 20 })
  phone: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A5) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'channel', type: 'varchar', length: 20 })
  channel: NotificationChannel;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: NotificationEventType;

  @Column({ name: 'template_name', length: 120 })
  templateName: string;

  @Column({ name: 'language_code', length: 10, default: 'en_US' })
  languageCode: string;

  /** Rendered parameter values sent to the API */
  @Column({ name: 'template_params', type: 'jsonb', default: [] })
  templateParams: string[];

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: NotificationStatus;

  /** Message ID returned by WhatsApp Cloud API on success */
  @Column({ name: 'provider_message_id', type: 'varchar', nullable: true, length: 120 })
  providerMessageId: string | null;

  /** Error detail on failure */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** Number of send attempts made */
  @Column({ name: 'attempts', default: 0 })
  attempts: number;

  /** FK to loyalty account (nullable — e.g. for guest notifications) */
  @Column({ name: 'loyalty_account_id', type: 'varchar', length: 36, nullable: true })
  @Index()
  loyaltyAccountId: string | null;

  /** Patient MRN for cross-reference */
  @Column({ name: 'mrn', type: 'varchar', nullable: true, length: 40 })
  mrn: string | null;

  /** Extra context (bill id, campaign id, etc.) */
  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
