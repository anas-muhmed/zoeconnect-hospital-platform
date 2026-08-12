import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CMSMedia, CmsMediaType } from '../entities/cms-media.entity';
import { CMSPlaylistItem } from '../entities/cms-playlist-item.entity';
import { CMSPlaylist } from '../entities/cms-playlist.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface MediaUsage {
  playlistId: string;
  playlistName: string;
  itemCount: number;
}

@Injectable()
export class CmsMediaService {
  constructor(
    @InjectRepository(CMSMedia)
    private readonly mediaRepo: Repository<CMSMedia>,
    @InjectRepository(CMSPlaylistItem)
    private readonly itemRepo: Repository<CMSPlaylistItem>,
    @InjectRepository(CMSPlaylist)
    private readonly playlistRepo: Repository<CMSPlaylist>,

    /**
     * Stage B (Checkpoint B3.6) — scoped repositories for `list()`/
     * `findOne()`/`getUsage()` only. `create()`, `remove()`, `restore()`,
     * `permanentDelete()` stay on the raw repos above.
     */
    @Inject(getTenantScopedRepositoryToken(CMSMedia))
    private readonly scopedMediaRepo: TenantScopedRepository<CMSMedia>,
    @Inject(getTenantScopedRepositoryToken(CMSPlaylistItem))
    private readonly scopedItemRepo: TenantScopedRepository<CMSPlaylistItem>,
    @Inject(getTenantScopedRepositoryToken(CMSPlaylist))
    private readonly scopedPlaylistRepo: TenantScopedRepository<CMSPlaylist>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(data: {
    branchId: string | null;
    filename: string;
    originalName: string;
    url: string;
    mimeType: string;
    mediaType: CmsMediaType;
    size: number;
    uploadedBy: string;
    checksum?: string | null;
    width?: number | null;
    height?: number | null;
  }): Promise<CMSMedia> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const media = this.mediaRepo.create({ ...data, tenantId });
    return this.mediaRepo.save(media);
  }

  // A5.5 API Contract Audit: admin GET /cms/media -- explicit select excludes tenantId.
  async list(branchId?: string, includeDeleted = false): Promise<CMSMedia[]> {
    return this.scopedMediaRepo.find({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(includeDeleted ? {} : { deletedAt: IsNull() }),
      },
      order: { createdAt: 'DESC' },
      select: [
        'id', 'branchId', 'filename', 'originalName', 'url', 'mimeType', 'mediaType',
        'size', 'durationSeconds', 'checksum', 'width', 'height', 'uploadedBy',
        'deletedAt', 'createdAt', 'updatedAt',
      ],
    });
  }

  async findOne(id: string): Promise<CMSMedia> {
    const media = await this.scopedMediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException(`CMS media "${id}" not found`);
    return media;
  }

  /** Which playlists (draft, regardless of publish state) currently reference this media. */
  async getUsage(mediaId: string): Promise<MediaUsage[]> {
    const items = await this.scopedItemRepo.find({ where: { mediaId } });
    if (items.length === 0) return [];

    const playlistIds = [...new Set(items.map(i => i.playlistId))];
    // Note: findByIds() isn't wrapped by TenantScopedRepository (it's a
    // deprecated TypeORM method); using find({ where: { id: In(...) } })
    // on the scoped repo instead achieves the same result.
    const playlists = await this.scopedPlaylistRepo.find({ where: { id: In(playlistIds) } });
    const playlistMap = new Map(playlists.map(p => [p.id, p]));

    return playlistIds.map(playlistId => ({
      playlistId,
      playlistName: playlistMap.get(playlistId)?.name ?? 'Unknown playlist',
      itemCount: items.filter(i => i.playlistId === playlistId).length,
    }));
  }

  /** Soft delete: hides the media from the library but keeps the file and row (recoverable via restore()). */
  async remove(id: string): Promise<CMSMedia> {
    const media = await this.findOne(id);
    media.deletedAt = new Date();
    return this.mediaRepo.save(media);
  }

  async restore(id: string): Promise<CMSMedia> {
    const media = await this.findOne(id);
    media.deletedAt = null;
    return this.mediaRepo.save(media);
  }

  /**
   * Permanently deletes a soft-deleted media row (the caller is responsible
   * for removing the underlying file afterward). Refuses if any playlist
   * still references it, to avoid leaving dangling item.mediaId rows.
   */
  async permanentDelete(id: string): Promise<CMSMedia> {
    const media = await this.findOne(id);
    const usage = await this.getUsage(id);
    if (usage.length > 0) {
      throw new ConflictException(
        `Cannot permanently delete: still used by ${usage.length} playlist(s) (${usage.map(u => u.playlistName).join(', ')})`,
      );
    }
    await this.mediaRepo.remove(media);
    return media;
  }
}
