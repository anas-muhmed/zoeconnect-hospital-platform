import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * CMSPlaylist --- an ordered collection of media items (via CMSPlaylistItem)
 * that can be published and assigned to one or more displays.
 *
 * Represents the *draft* / editable state. Edits here never affect what is
 * currently playing on a live display -- only publishing a new
 * CMSPublishVersion does that (see cms-publish-version.entity.ts).
 *
 * Entirely independent from the existing Custom Display module.
 */
@Entity('cms_playlists')
export class CMSPlaylist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_archived', default: false })
  isArchived: boolean;

  /** Points at the CMSPublishVersion currently considered "live" for this playlist (null until first publish) */
  @Column({ type: 'uuid', name: 'published_version_id', nullable: true })
  publishedVersionId: string | null;

  /** Set whenever the draft (items/settings) changes after the last publish -- drives an "unpublished changes" badge in the UI */
  @Column({ type: 'boolean', name: 'has_unpublished_changes', default: false })
  hasUnpublishedChanges: boolean;

  @Column({ type: 'varchar', name: 'created_by', length: 100 })
  createdBy: string;

  @Column({ type: 'varchar', name: 'updated_by', length: 100, nullable: true })
  updatedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A11) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
