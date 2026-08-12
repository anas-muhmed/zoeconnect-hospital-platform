import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSSettings } from '../entities/cms-settings.entity';
import { CmsAuditService } from '../audit/cms-audit.service';

type SettingsPatch = Partial<Omit<CMSSettings, 'id' | 'updatedAt'>>;

@Injectable()
export class CmsSettingsService {
  constructor(
    @InjectRepository(CMSSettings)
    private readonly settingsRepo: Repository<CMSSettings>,
    private readonly auditService: CmsAuditService,
  ) {}

  /** Singleton row pattern: always operate on the first (only) row. Migration seeds it
   *  via `INSERT INTO cms_settings DEFAULT VALUES`, so this should never be empty, but
   *  we fall back to creating one defensively in case the seed was ever skipped. */
  // A5.5 API Contract Audit: admin GET /cms/settings -- explicit select
  // excludes tenantId. The fallback create()+save() path (empty table) is a
  // write path and intentionally returns the full saved entity, same as
  // every other create() elsewhere in this audit.
  async get(): Promise<CMSSettings> {
    const existing = await this.settingsRepo.find({
      take: 1,
      select: [
        'id', 'playerPollIntervalMs', 'heartbeatIntervalMs', 'retryCount', 'retryDelayMs',
        'offlineTimeoutMs', 'maxCacheSizeMb', 'logRetentionDays', 'autoCleanupEnabled',
        'defaultImageDurationSeconds', 'updatedAt',
      ],
    });
    if (existing.length > 0) return existing[0];
    return this.settingsRepo.save(this.settingsRepo.create({}));
  }

  async update(patch: SettingsPatch, changedBy: string): Promise<CMSSettings> {
    const current = await this.get();
    Object.assign(current, patch);
    const saved = await this.settingsRepo.save(current);

    await this.auditService.log({
      entityType: 'CMSSettings', entityId: saved.id, action: 'UPDATE',
      changedBy, summary: 'Updated CMS global settings',
    });
    return saved;
  }
}
