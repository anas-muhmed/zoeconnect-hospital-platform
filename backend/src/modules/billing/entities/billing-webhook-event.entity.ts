import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Idempotency ledger for inbound payment-provider webhooks. Unique on
 * (provider, event_id) -- the webhook controller inserts a row (or
 * no-ops via ON CONFLICT DO NOTHING) before doing any processing, so a
 * duplicate delivery is detected before it can double-apply a state
 * transition. `payload` stores the raw, verified event body for audit/
 * replay; never store provider secrets or card data here (nothing in the
 * Razorpay payment/subscription webhook payload includes those, but
 * future providers must be checked before being wired in).
 */
@Entity('billing_webhook_events')
export class BillingWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider', type: 'varchar', length: 32 })
  provider: string;

  @Column({ name: 'event_id', type: 'varchar', length: 255 })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 128 })
  eventType: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'processed', type: 'boolean', default: false })
  processed: boolean;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
