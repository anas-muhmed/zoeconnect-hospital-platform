import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * CMSPublishVersion --- an immutable, point-in-time snapshot of a playlist
 * and its items, created each time an admin clicks "Publish".
 *
 * This is what the Player actually reads (via the display-assignment ->
 * published playlist -> latest CMSPublishVersion chain), which is what
 * guarantees draft edits never affect live playback until Publish is
 * pressed. Rows are append-only; never updated or deleted.
 */
@Entity('cms_publish_versions')
export class CMSPublishVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'playlist_id' })
  playlistId: string;

  /** Monotonically increasing per playlist (1, 2, 3, ...) */
  @Column({ type: 'int', name: 'version_number' })
  versionNumber: number;

  /**
   * Serialized snapshot of the playlist name + ordered items (with resolved
   * media url/mimeType/mediaType and per-item settings) at publish time.
   * A snapshot, not the live model -- the normalized cms_playlist_items
   * rows remain the editable source of truth for the draft.
   */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'varchar', name: 'published_by', length: 100 })
  publishedBy: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B). Tenant is
   * derivable via playlist_id → cms_playlists.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'published_at' })
  publishedAt: Date;
}
