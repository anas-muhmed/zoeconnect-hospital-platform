import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CMSPlaylist } from '../entities/cms-playlist.entity';
import { CMSPlaylistItem } from '../entities/cms-playlist-item.entity';
import { CMSPublishVersion } from '../entities/cms-publish-version.entity';
import { CMSMedia } from '../entities/cms-media.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface ItemSettingsInput {
  durationSeconds?: number | null;
  muted?: boolean;
  loopPlayback?: boolean;
  playFull?: boolean;
  enabled?: boolean;
}

@Injectable()
export class CmsPlaylistService {
  constructor(
    @InjectRepository(CMSPlaylist)
    private readonly playlistRepo: Repository<CMSPlaylist>,
    @InjectRepository(CMSPlaylistItem)
    private readonly itemRepo: Repository<CMSPlaylistItem>,
    @InjectRepository(CMSPublishVersion)
    private readonly versionRepo: Repository<CMSPublishVersion>,
    @InjectRepository(CMSMedia)
    private readonly mediaRepo: Repository<CMSMedia>,
    private readonly dataSource: DataSource,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repositories for `list()`/
     * `findOne()`/`listItems()`/`preview()`/`listVersions()` only.
     * `getLatestPublishedVersion()` stays raw — reached only from the
     * anonymous player chain (chain-resolved, deferred to B5). Every write
     * path stays on the raw repos above.
     */
    @Inject(getTenantScopedRepositoryToken(CMSPlaylist))
    private readonly scopedPlaylistRepo: TenantScopedRepository<CMSPlaylist>,
    @Inject(getTenantScopedRepositoryToken(CMSPlaylistItem))
    private readonly scopedItemRepo: TenantScopedRepository<CMSPlaylistItem>,
    @Inject(getTenantScopedRepositoryToken(CMSPublishVersion))
    private readonly scopedVersionRepo: TenantScopedRepository<CMSPublishVersion>,
    @Inject(getTenantScopedRepositoryToken(CMSMedia))
    private readonly scopedMediaRepo: TenantScopedRepository<CMSMedia>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Playlists --------------------------------------------------------------

  // A5.5 API Contract Audit: admin GET /cms/playlists -- explicit select excludes tenantId.
  async list(branchId?: string): Promise<CMSPlaylist[]> {
    return this.scopedPlaylistRepo.find({
      where: { isArchived: false, ...(branchId ? { branchId } : {}) },
      order: { updatedAt: 'DESC' },
      select: [
        'id', 'branchId', 'name', 'description', 'isArchived',
        'publishedVersionId', 'hasUnpublishedChanges', 'createdBy', 'updatedBy',
        'createdAt', 'updatedAt',
      ],
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/playlists/:id -- also backs
  // preview()/publish()/update()/etc as a write-adjacent read; none of those
  // read playlist.tenantId, so excluding it here is safe everywhere.
  async findOne(id: string): Promise<CMSPlaylist> {
    const playlist = await this.scopedPlaylistRepo.findOne({
      where: { id },
      select: [
        'id', 'branchId', 'name', 'description', 'isArchived',
        'publishedVersionId', 'hasUnpublishedChanges', 'createdBy', 'updatedBy',
        'createdAt', 'updatedAt',
      ],
    });
    if (!playlist) throw new NotFoundException(`Playlist "${id}" not found`);
    return playlist;
  }

  async create(data: { branchId: string | null; name: string; description?: string | null; createdBy: string }): Promise<CMSPlaylist> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const playlist = this.playlistRepo.create({
      branchId: data.branchId,
      name: data.name,
      description: data.description ?? null,
      createdBy: data.createdBy,
      tenantId,
    });
    const saved = await this.playlistRepo.save(playlist);
    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: saved.id, action: 'CREATE',
      changedBy: data.createdBy, branchId: data.branchId, summary: `Created playlist "${saved.name}"`,
    });
    return saved;
  }

  async update(id: string, data: { name?: string; description?: string | null; updatedBy: string }): Promise<CMSPlaylist> {
    const playlist = await this.findOne(id);
    if (data.name !== undefined) playlist.name = data.name;
    if (data.description !== undefined) playlist.description = data.description;
    playlist.updatedBy = data.updatedBy;
    playlist.hasUnpublishedChanges = true;
    const saved = await this.playlistRepo.save(playlist);
    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: id, action: 'UPDATE',
      changedBy: data.updatedBy, summary: `Updated playlist "${saved.name}"`,
    });
    return saved;
  }

  async archive(id: string): Promise<void> {
    const playlist = await this.findOne(id);
    playlist.isArchived = true;
    await this.playlistRepo.save(playlist);
    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: id, action: 'ARCHIVE',
      changedBy: playlist.updatedBy ?? playlist.createdBy, summary: `Archived playlist "${playlist.name}"`,
    });
  }

  async duplicate(id: string, createdBy: string): Promise<CMSPlaylist> {
    const source = await this.findOne(id);
    const items = await this.itemRepo.find({ where: { playlistId: id }, order: { displayOrder: 'ASC' } });

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const copy = this.playlistRepo.create({
      branchId: source.branchId,
      name: `${source.name} (Copy)`,
      description: source.description,
      createdBy,
      tenantId,
    });
    const saved = await this.playlistRepo.save(copy);

    if (items.length > 0) {
      const newItems = items.map(item => this.itemRepo.create({
        playlistId: saved.id,
        mediaId: item.mediaId,
        widgetType: item.widgetType,
        configuration: item.configuration,
        displayOrder: item.displayOrder,
        enabled: item.enabled,
        durationSeconds: item.durationSeconds,
        muted: item.muted,
        loopPlayback: item.loopPlayback,
        playFull: item.playFull,
        tenantId,
      }));
      await this.itemRepo.save(newItems);
    }

    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, branchId: source.branchId, summary: `Duplicated from "${source.name}"`,
    });
    return saved;
  }

  // -- Playlist items -----------------------------------------------------------

  // A5.5 API Contract Audit: admin GET /cms/playlists/:id/items (also feeds
  // preview()). Both the item rows and the joined media rows carry their own
  // tenantId columns -- stripped post-fetch on both since this shape (item
  // spread + attached `media`) makes an explicit select on the merged object
  // impractical.
  async listItems(playlistId: string): Promise<Array<CMSPlaylistItem & { media: CMSMedia | undefined }>> {
    await this.findOne(playlistId);
    const items = await this.scopedItemRepo.find({ where: { playlistId }, order: { displayOrder: 'ASC' } });
    const mediaIds = items.map(i => i.mediaId).filter((id): id is string => id !== null);
    // findByIds() isn't wrapped by TenantScopedRepository (deprecated TypeORM
    // method) — find({ where: { id: In(...) } }) on the scoped repo instead.
    const mediaRows = mediaIds.length
      ? await this.scopedMediaRepo.find({ where: { id: In(mediaIds) } })
      : [];
    const mediaMap = new Map(mediaRows.map(m => [m.id, m]));
    return items.map(item => {
      const { tenantId: _itemTenantId, ...itemRest } = item;
      const media = item.mediaId ? mediaMap.get(item.mediaId) : undefined;
      if (media) {
        const { tenantId: _mediaTenantId, ...mediaRest } = media;
        return { ...itemRest, media: mediaRest } as CMSPlaylistItem & { media: CMSMedia | undefined };
      }
      return { ...itemRest, media: undefined } as CMSPlaylistItem & { media: CMSMedia | undefined };
    });
  }

  async addItem(playlistId: string, data: { mediaId: string } & ItemSettingsInput): Promise<CMSPlaylistItem> {
    const playlist = await this.findOne(playlistId);
    const media = await this.mediaRepo.findOne({ where: { id: data.mediaId, deletedAt: IsNull() } });
    if (!media) throw new NotFoundException(`Media "${data.mediaId}" not found`);

    const maxOrder = await this.itemRepo
      .createQueryBuilder('item')
      .select('MAX(item.displayOrder)', 'max')
      .where('item.playlistId = :playlistId', { playlistId })
      .getRawOne<{ max: number | null }>();

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const item = this.itemRepo.create({
      playlistId,
      mediaId: data.mediaId,
      displayOrder: (maxOrder?.max ?? -1) + 1,
      enabled: data.enabled ?? true,
      durationSeconds: media.mediaType === 'IMAGE' ? (data.durationSeconds ?? 10) : null,
      muted: data.muted ?? true,
      loopPlayback: data.loopPlayback ?? false,
      playFull: data.playFull ?? true,
      tenantId,
    });
    const saved = await this.itemRepo.save(item);

    playlist.hasUnpublishedChanges = true;
    await this.playlistRepo.save(playlist);
    return saved;
  }

  /**
   * Adds a widget item (Phase 5) -- a playlist entry backed by a renderer
   * plugin's configuration rather than an uploaded media file (e.g. Queue
   * Widget). `widgetType` must match a registered CMSRendererPlugin.contentType
   * on the frontend (not validated server-side -- the player simply won't
   * find a renderer for an unrecognized type and will skip the item).
   */
  async addWidgetItem(playlistId: string, data: { widgetType: string; configuration: Record<string, unknown>; durationSeconds?: number | null } & Pick<ItemSettingsInput, 'enabled'>): Promise<CMSPlaylistItem> {
    const playlist = await this.findOne(playlistId);

    const maxOrder = await this.itemRepo
      .createQueryBuilder('item')
      .select('MAX(item.displayOrder)', 'max')
      .where('item.playlistId = :playlistId', { playlistId })
      .getRawOne<{ max: number | null }>();

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const item = this.itemRepo.create({
      playlistId,
      mediaId: null,
      widgetType: data.widgetType,
      configuration: data.configuration ?? {},
      displayOrder: (maxOrder?.max ?? -1) + 1,
      enabled: data.enabled ?? true,
      durationSeconds: data.durationSeconds ?? 15,
      muted: true,
      loopPlayback: false,
      playFull: true,
      tenantId,
    });
    const saved = await this.itemRepo.save(item);

    playlist.hasUnpublishedChanges = true;
    await this.playlistRepo.save(playlist);
    return saved;
  }

  async updateItem(playlistId: string, itemId: string, data: ItemSettingsInput & { configuration?: Record<string, unknown> }): Promise<CMSPlaylistItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, playlistId } });
    if (!item) throw new NotFoundException(`Playlist item "${itemId}" not found`);

    if (data.durationSeconds !== undefined) item.durationSeconds = data.durationSeconds;
    if (data.muted !== undefined) item.muted = data.muted;
    if (data.loopPlayback !== undefined) item.loopPlayback = data.loopPlayback;
    if (data.playFull !== undefined) item.playFull = data.playFull;
    if (data.enabled !== undefined) item.enabled = data.enabled;
    if (data.configuration !== undefined && item.widgetType) item.configuration = data.configuration;

    const saved = await this.itemRepo.save(item);
    await this._markUnpublished(playlistId);
    return saved;
  }

  async removeItem(playlistId: string, itemId: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, playlistId } });
    if (!item) throw new NotFoundException(`Playlist item "${itemId}" not found`);
    await this.itemRepo.remove(item);
    await this._markUnpublished(playlistId);
  }

  /** Reorders items: `orderedItemIds` is the full, new top-to-bottom order for the playlist. */
  async reorderItems(playlistId: string, orderedItemIds: string[]): Promise<void> {
    await this.findOne(playlistId);
    const items = await this.itemRepo.find({ where: { playlistId } });
    const itemMap = new Map(items.map(i => [i.id, i]));

    if (orderedItemIds.length !== items.length || !orderedItemIds.every(id => itemMap.has(id))) {
      throw new BadRequestException('orderedItemIds must contain exactly the current playlist item ids');
    }

    await this.dataSource.transaction(async manager => {
      for (let index = 0; index < orderedItemIds.length; index++) {
        await manager.update(CMSPlaylistItem, { id: orderedItemIds[index] }, { displayOrder: index });
      }
    });
    await this._markUnpublished(playlistId);
  }

  private async _markUnpublished(playlistId: string): Promise<void> {
    await this.playlistRepo.update({ id: playlistId }, { hasUnpublishedChanges: true });
  }

  // -- Publish / preview / version history --------------------------------------

  /** Preview: returns the current draft (items + resolved media) without publishing. */
  async preview(playlistId: string) {
    const playlist = await this.findOne(playlistId);
    const items = await this.listItems(playlistId);
    return {
      playlist,
      items: items
        .filter(i => i.enabled)
        .map(i => this._toSnapshotItem(i)),
    };
  }

  /**
   * Validates a playlist's enabled items are safe to publish:
   *  - at least one enabled item
   *  - every enabled item's media still exists and isn't soft-deleted
   *  - image items have a positive duration
   *  - display orders among enabled items are unique (should always hold given
   *    reorderItems' transactional update, but checked defensively before publish)
   * Throws BadRequestException with a specific, actionable message on failure.
   */
  private _validateForPublish(items: Array<CMSPlaylistItem & { media: CMSMedia | undefined }>): Array<CMSPlaylistItem & { media: CMSMedia | undefined }> {
    const enabled = items.filter(i => i.enabled);
    if (enabled.length === 0) {
      throw new BadRequestException('Cannot publish a playlist with no enabled items');
    }

    // Only media-backed items need a live, non-deleted CMSMedia row -- widget items (mediaId null) are exempt.
    const brokenMedia = enabled.filter(i => i.mediaId !== null && (!i.media || i.media.deletedAt));
    if (brokenMedia.length > 0) {
      throw new BadRequestException(
        `Cannot publish: ${brokenMedia.length} item(s) reference missing or deleted media. Remove or replace them first.`,
      );
    }

    // Both IMAGE items and widget items (which have no natural "end" event) need a positive display duration.
    const badDuration = enabled.filter(i =>
      (i.media?.mediaType === 'IMAGE' || i.widgetType) && (!i.durationSeconds || i.durationSeconds <= 0),
    );
    if (badDuration.length > 0) {
      throw new BadRequestException(`Cannot publish: ${badDuration.length} item(s) have an invalid display duration`);
    }

    const orders = enabled.map(i => i.displayOrder);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Cannot publish: duplicate display order detected among enabled items');
    }

    return enabled;
  }

  async publish(playlistId: string, publishedBy: string): Promise<CMSPublishVersion> {
    const playlist = await this.findOne(playlistId);
    const items = await this.listItems(playlistId);
    const enabledItems = this._validateForPublish(items);

    const snapshot = {
      playlistId,
      name: playlist.name,
      items: enabledItems.map(i => this._toSnapshotItem(i)),
    };

    const saved = await this._createVersion(playlistId, snapshot, publishedBy);

    playlist.publishedVersionId = saved.id;
    playlist.hasUnpublishedChanges = false;
    await this.playlistRepo.save(playlist);

    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: playlistId, action: 'PUBLISH', changedBy: publishedBy,
      summary: `Published version ${saved.versionNumber} (${enabledItems.length} item(s))`,
    });

    return saved;
  }

  /** All publish versions for a playlist, newest first. Used by the version history UI. */
  // A5.5 API Contract Audit: admin GET /cms/playlists/:id/versions -- explicit select excludes tenantId.
  async listVersions(playlistId: string): Promise<CMSPublishVersion[]> {
    await this.findOne(playlistId);
    return this.scopedVersionRepo.find({
      where: { playlistId },
      order: { versionNumber: 'DESC' },
      select: ['id', 'playlistId', 'versionNumber', 'snapshot', 'publishedBy', 'publishedAt'],
    });
  }

  /**
   * Rolls back to a prior published version by re-publishing its snapshot as
   * a brand-new version (append-only history is preserved -- rollback never
   * mutates or deletes an existing CMSPublishVersion row, it just makes an
   * old snapshot current again under a new version number).
   */
  async rollback(playlistId: string, versionId: string, publishedBy: string): Promise<CMSPublishVersion> {
    const playlist = await this.findOne(playlistId);
    const target = await this.versionRepo.findOne({ where: { id: versionId, playlistId } });
    if (!target) throw new NotFoundException(`Publish version "${versionId}" not found for this playlist`);

    const saved = await this._createVersion(playlistId, target.snapshot, publishedBy);

    playlist.publishedVersionId = saved.id;
    await this.playlistRepo.save(playlist);

    await this.auditService.log({
      entityType: 'CMSPlaylist', entityId: playlistId, action: 'ROLLBACK', changedBy: publishedBy,
      summary: `Rolled back to version ${target.versionNumber} (now live as version ${saved.versionNumber})`,
    });

    return saved;
  }

  private async _createVersion(playlistId: string, snapshot: Record<string, unknown>, publishedBy: string): Promise<CMSPublishVersion> {
    const lastVersion = await this.versionRepo.findOne({
      where: { playlistId },
      order: { versionNumber: 'DESC' },
    });
    const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const version = this.versionRepo.create({
      playlistId,
      versionNumber,
      snapshot,
      publishedBy,
      tenantId,
    });
    return this.versionRepo.save(version);
  }

  // A5.5 API Contract Audit: reached from the anonymous
  // `GET player/:slug/active-content` chain (CmsDisplayService.getActiveContent
  // embeds this return value directly as `version` in the public response).
  // Explicit select excludes tenantId from what unauthenticated player
  // traffic receives.
  async getLatestPublishedVersion(playlistId: string): Promise<CMSPublishVersion | null> {
    const playlist = await this.playlistRepo.findOne({ where: { id: playlistId } });
    if (!playlist?.publishedVersionId) return null;
    return this.versionRepo.findOne({
      where: { id: playlist.publishedVersionId },
      select: ['id', 'playlistId', 'versionNumber', 'snapshot', 'publishedBy', 'publishedAt'],
    });
  }

  private _toSnapshotItem(item: CMSPlaylistItem & { media: CMSMedia | undefined }) {
    return {
      itemId: item.id,
      mediaId: item.mediaId,
      url: item.media?.url ?? '',
      mimeType: item.media?.mimeType ?? '',
      // Widget items resolve their content type from widgetType (matches a
      // frontend CMSRendererPlugin.contentType, e.g. 'QUEUE_WIDGET') since
      // they have no backing CMSMedia row to read mediaType from.
      mediaType: item.media?.mediaType ?? item.widgetType,
      // Human-readable label for device monitoring / player health reports.
      // Purely additive -- existing player renderer components ignore it.
      mediaName: item.media?.originalName ?? (item.widgetType ? `Widget: ${item.widgetType}` : null),
      durationSeconds: item.durationSeconds,
      muted: item.muted,
      loopPlayback: item.loopPlayback,
      playFull: item.playFull,
      configuration: item.configuration ?? null,
    };
  }
}
