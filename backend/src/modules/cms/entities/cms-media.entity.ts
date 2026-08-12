import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type CmsMediaType = 'IMAGE' | 'VIDEO';

/**
 * CMSMedia --- a single uploaded media asset (image or video) available to
 * be placed into one or more CMS playlists.
 *
 * Entirely independent from the existing Custom Display media library
 * (token_module's `display-media` upload). Files are stored on the same
 * uploads volume but under a separate `cms-media/` subfolder, with their
 * own DB-backed catalog here.
 *
 * Soft-delete: `deletedAt` marks a media item as removed from the library
 * without deleting the underlying file or breaking existing playlist items /
 * published snapshots that still reference it. A permanent-delete path
 * (CmsMediaService.permanentDelete) exists separately and refuses to run
 * while any playlist item still references the media (see
 * CmsMediaService.getUsage).
 */
@Entity('cms_media')
export class CMSMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', name: 'branch_id', length: 30, nullable: true })
  branchId: string | null;

  /** Filename as stored on disk under uploads/cms-media/ */
  @Column({ type: 'varchar', length: 255 })
  filename: string;

  /** Original filename provided by the uploader */
  @Column({ type: 'varchar', name: 'original_name', length: 255 })
  originalName: string;

  /** Public URL, e.g. /uploads/cms-media/<filename> */
  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ type: 'varchar', name: 'media_type', length: 10 })
  mediaType: CmsMediaType;

  @Column({ type: 'bigint' })
  size: number;

  /** Duration in seconds for video files, detected at upload time (null for images) */
  @Column({ type: 'int', name: 'duration_seconds', nullable: true })
  durationSeconds: number | null;

  /** SHA-256 hex digest of the file contents, computed at upload time */
  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum: string | null;

  /** Pixel dimensions, detected at upload time for IMAGE files (PNG/JPEG only today; other formats are left null) */
  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', name: 'uploaded_by', length: 100 })
  uploadedBy: string;

  /** Soft-delete marker. Null = active. Set = hidden from the library but file/rows kept for recovery. */
  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

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
