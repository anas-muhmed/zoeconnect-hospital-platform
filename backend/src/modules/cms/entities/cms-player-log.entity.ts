import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * CMSPlayerLog --- server-side copy of a player's local log entries
 * (see frontend player-log.ts), uploaded piggy-backed on each health
 * report so administrators can view a display's recent errors and sync
 * history remotely without physical access to the kiosk. Capped per
 * display by CmsPlayerLogService (oldest rows pruned beyond a cap), and
 * subject to CMSSettings.logRetentionDays for time-based cleanup.
 */
@Entity('cms_player_logs')
export class CMSPlayerLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'display_assignment_id' })
  displayAssignmentId: string;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'text' })
  message: string;

  /** Client-reported timestamp of when the event actually happened on the player */
  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'received_at' })
  receivedAt: Date;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via display_assignment_id → cms_display_assignments.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;
}
