import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * CMSPlaylistItem --- a single content entry within a playlist's draft, with
 * its own ordering and per-item playback settings.
 *
 * Kept as a normalized row (not a JSON blob inside CMSPlaylist) so items can
 * be queried, reordered, and validated independently, per the CMS spec's
 * explicit "normalized relational tables" requirement.
 *
 * Phase 5 Sprint 0 generalizes this from "always a media file" into a
 * content-item model: an item is either media-backed (mediaId set,
 * widgetType null) or widget-backed (mediaId null, widgetType set,
 * configuration holds the renderer plugin's settings) -- enforced with a DB
 * CHECK constraint (see migration CmsPluginConfig1783540000000). This lets
 * non-file-backed renderer plugins (Queue Widget, and future HTML/Dashboard/
 * Clock/Weather/RSS/Embedded-Page plugins) sit in the same playlist loop as
 * images/videos without a second, parallel table.
 */
@Entity('cms_playlist_items')
export class CMSPlaylistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'playlist_id' })
  playlistId: string;

  /** Null for widget items -- see class doc. */
  @Column({ type: 'uuid', name: 'media_id', nullable: true })
  mediaId: string | null;

  /** Set only for widget items; matches a CMSRendererPlugin.contentType on the frontend (e.g. 'QUEUE_WIDGET'). */
  @Column({ type: 'varchar', name: 'widget_type', length: 50, nullable: true })
  widgetType: string | null;

  /** Widget items only: plugin-specific settings as JSON (e.g. Queue Widget's referenceId/theme/refreshSeconds). */
  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, unknown> | null;

  /** 0-based position within the playlist */
  @Column({ type: 'int', name: 'display_order' })
  displayOrder: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** IMAGE and widget items: how long to display, in seconds (ignored for videos) */
  @Column({ type: 'int', name: 'duration_seconds', nullable: true })
  durationSeconds: number | null;

  /** VIDEO items only: play muted */
  @Column({ type: 'boolean', name: 'muted', default: true })
  muted: boolean;

  /** VIDEO items only: loop this single video before advancing */
  @Column({ type: 'boolean', name: 'loop_playback', default: false })
  loopPlayback: boolean;

  /** VIDEO items only: always play the full video length rather than a capped duration */
  @Column({ type: 'boolean', name: 'play_full', default: true })
  playFull: boolean;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via playlist_id → cms_playlists.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
