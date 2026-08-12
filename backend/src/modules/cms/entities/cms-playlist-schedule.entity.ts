import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * CMSPlaylistSchedule --- binds a playlist to a display for a specific
 * time-of-day window and/or date range, with a priority used to resolve
 * overlaps (highest priority wins). Evaluated at read time by
 * CmsScheduleService.resolveActivePlaylist() -- there is no background job;
 * the player simply asks "which playlist is active right now" on every
 * active-content poll.
 *
 * If no schedule is currently active for a display, CmsDisplayService falls
 * back to the display assignment's plain `playlistId` (the Phase 1
 * behavior), so Phase 1 displays with no schedules keep working unchanged.
 */
@Entity('cms_playlist_schedules')
export class CMSPlaylistSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'display_assignment_id' })
  displayAssignmentId: string;

  @Column({ type: 'uuid', name: 'playlist_id' })
  playlistId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  /** Time-of-day window, inclusive. Null start/end means unbounded on that side.
   *  If startTime > endTime, the window wraps past midnight (e.g. 22:00-06:00). */
  @Column({ type: 'time', name: 'start_time', nullable: true })
  startTime: string | null;

  @Column({ type: 'time', name: 'end_time', nullable: true })
  endTime: string | null;

  /** Date range, inclusive. Null start/end means unbounded on that side. */
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  /** Higher priority wins when multiple schedules are simultaneously active. */
  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via display_assignment_id → cms_display_assignments.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
