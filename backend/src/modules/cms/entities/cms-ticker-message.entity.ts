import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Where a ticker message's text comes from. Stored as a plain varchar (not a
 * DB enum) specifically so future source types can be added without a
 * migration -- the player and admin UI only need to know how to *display* a
 * source badge, never how to resolve one (that stays server-side).
 *
 * - MANUAL:    text typed directly by an admin (only type supported today).
 * - EMERGENCY: reserved for auto-mirroring an active CMSEmergencyBroadcast.
 * - QUEUE:     reserved for a live token-queue feed (e.g. "Now serving #42").
 * - API_FEED:  reserved for an external feed polled by a future integration,
 *              identified by `sourceRef` (e.g. a feed id/URL key).
 * Wiring up EMERGENCY/QUEUE/API_FEED later only means adding a small
 * resolver that upserts CmsTickerMessage rows -- CmsTickerService's
 * resolution logic (priority + schedule window) and the player's rendering
 * are already source-agnostic and require no changes.
 */
export type CmsTickerSourceType = 'MANUAL' | 'EMERGENCY' | 'QUEUE' | 'API_FEED';

/**
 * CMSTickerMessage --- one message in a display's scrolling ticker rotation.
 * A display can have many messages; all messages currently "active" (see
 * CmsTickerService.isActiveNow, which reuses the same time-of-day/date-range
 * window logic as CMSPlaylistSchedule) are concatenated in priority order
 * and scrolled continuously by the player, independent of whatever content
 * item is currently playing in the main playlist rotation.
 */
@Entity('cms_ticker_messages')
export class CMSTickerMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'display_assignment_id' })
  displayAssignmentId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', name: 'source_type', length: 20, default: 'MANUAL' })
  sourceType: CmsTickerSourceType;

  /** Opaque pointer into whatever system owns this message when sourceType !== 'MANUAL'. */
  @Column({ type: 'varchar', name: 'source_ref', length: 150, nullable: true })
  sourceRef: string | null;

  /** Higher priority messages are shown first when multiple are active at once. */
  @Column({ type: 'int', default: 0 })
  priority: number;

  /** Time-of-day window, inclusive. Null start/end means unbounded on that side. */
  @Column({ type: 'time', name: 'start_time', nullable: true })
  startTime: string | null;

  @Column({ type: 'time', name: 'end_time', nullable: true })
  endTime: string | null;

  /** Date range, inclusive. Null start/end means unbounded on that side. */
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via display_assignment_id → cms_display_assignments for
   * today's MANUAL-only sourceType; EMERGENCY/QUEUE/API_FEED sourceTypes
   * are reserved but unimplemented, so no external-ownership concern yet.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
