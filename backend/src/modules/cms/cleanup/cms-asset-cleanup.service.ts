import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CMSMedia } from '../entities/cms-media.entity';
import { CMSPlaylistItem } from '../entities/cms-playlist-item.entity';
import { CMSPublishVersion } from '../entities/cms-publish-version.entity';
import { CmsSettingsService } from '../settings/cms-settings.service';
import { CmsPlayerLogService } from '../logs/cms-player-log.service';
import { CmsAuditService } from '../audit/cms-audit.service';
import { ObjectRepositoryService } from '../../platform/services/object-repository/services/object-repository.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/**
 * Removes media that has been soft-deleted (CMSMedia.deletedAt set) and is no
 * longer referenced anywhere -- neither by a live playlist item nor by any
 * historical publish-version snapshot -- so storage doesn't grow forever.
 * Runs nightly (gated by CMSSettings.autoCleanupEnabled) and can also be
 * triggered manually from the admin UI. Also purges old player logs per
 * CMSSettings.logRetentionDays.
 */
@Injectable()
export class CmsAssetCleanupService {
  private readonly logger = new Logger(CmsAssetCleanupService.name);

  constructor(
    @InjectRepository(CMSMedia)
    private readonly mediaRepo: Repository<CMSMedia>,
    @InjectRepository(CMSPlaylistItem)
    private readonly itemRepo: Repository<CMSPlaylistItem>,
    @InjectRepository(CMSPublishVersion)
    private readonly versionRepo: Repository<CMSPublishVersion>,
    private readonly settingsService: CmsSettingsService,
    private readonly playerLogService: CmsPlayerLogService,
    private readonly auditService: CmsAuditService,
    private readonly objectRepository: ObjectRepositoryService,
  ) {}

  @Cron('0 30 2 * * *', { name: 'cms-asset-cleanup', timeZone: 'Asia/Kolkata' })
  async runScheduled(): Promise<void> {
    const settings = await this.settingsService.get();
    if (!settings.autoCleanupEnabled) {
      this.logger.log('CMS auto-cleanup is disabled in settings; skipping');
      return;
    }
    const result = await this.cleanupOrphanedMedia();
    const purgedLogs = await this.playerLogService.purgeOlderThan(settings.logRetentionDays);
    this.logger.log(`CMS cleanup: removed ${result.removed} orphaned media, purged ${purgedLogs} old log rows`);
  }

  /** Manual trigger from the admin UI (Asset Cleanup button). */
  async cleanupOrphanedMedia(triggeredBy = 'system'): Promise<{ removed: number; failedFileDeletes: string[] }> {
    const softDeleted = await this.mediaRepo.find({ where: { deletedAt: Not(IsNull()) } });
    const failedFileDeletes: string[] = [];
    let removed = 0;
    // Phase 8 (Task 8.6): tally removals per-tenant (row-derived, same
    // pattern as the other cron fixes in this task) so the summary audit
    // log below can be split per tenant instead of stamping a single
    // tenantId=null bulk entry -- CmsAuditService.log() resolves tenantId
    // via ambient TenantContextStorage, which is unset for @Cron jobs.
    const removedByTenant = new Map<string | null, number>();

    for (const media of softDeleted) {
      const inLiveItem = await this.itemRepo.count({ where: { mediaId: media.id } });
      if (inLiveItem > 0) continue;

      // Historical publish versions store item snapshots as JSON, not FK rows, so we
      // scan them for a reference to this media's id/url before permanently deleting.
      const referencedInHistory = await this.versionRepo
        .createQueryBuilder('v')
        .where(`v.snapshot::text LIKE :needle`, { needle: `%${media.id}%` })
        .getCount();
      if (referencedInHistory > 0) continue;

      try {
        if (media.url && media.url.startsWith('/uploads/')) {
          // Same object-id convention as LocalStorageProvider's callers:
          // "<subdir>/<filename>" relative to the uploads root, derived here
          // from the stored public URL ("/uploads/cms-media/<filename>")
          // exactly as the old code derived its on-disk path from it.
          const objectId = media.url.replace(/^\/uploads\//, '');
          await this.objectRepository.deleteFile(objectId).catch(() => undefined);
        }
      } catch {
        failedFileDeletes.push(media.filename);
      }

      await this.mediaRepo.remove(media);
      removed += 1;
      removedByTenant.set(media.tenantId, (removedByTenant.get(media.tenantId) ?? 0) + 1);
    }

    for (const [tenantId, count] of removedByTenant) {
      const logEntry = () =>
        this.auditService.log({
          entityType: 'CMSMedia', entityId: 'bulk', action: 'DELETE',
          changedBy: triggeredBy, summary: `Asset cleanup permanently removed ${count} orphaned media file(s)`,
        });
      if (tenantId) {
        await TenantContextStorage.run(tenantId, logEntry);
      } else {
        await logEntry();
      }
    }
    return { removed, failedFileDeletes };
  }
}
