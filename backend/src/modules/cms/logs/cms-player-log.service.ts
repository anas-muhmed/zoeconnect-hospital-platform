import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CMSPlayerLog } from '../entities/cms-player-log.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

const MAX_LOGS_PER_DISPLAY = 500;

@Injectable()
export class CmsPlayerLogService {
  constructor(
    @InjectRepository(CMSPlayerLog)
    private readonly logRepo: Repository<CMSPlayerLog>,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `listRecent()` only
     * (reached from `CmsDisplayService.getDiagnostics()`, a session-resolved
     * admin route). `ingest()` (called from the anonymous `reportHealth()`
     * chain, also a write) and `purgeOlderThan()` (`@Cron`-only) stay raw.
     */
    @Inject(getTenantScopedRepositoryToken(CMSPlayerLog))
    private readonly scopedLogRepo: TenantScopedRepository<CMSPlayerLog>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /** Ingests a batch of log lines uploaded alongside a health report, then prunes the
   *  oldest rows for that display beyond MAX_LOGS_PER_DISPLAY so the table stays bounded
   *  even if a display never gets time-based cleanup applied. */
  async ingest(displayAssignmentId: string, entries: { category: string; message: string; occurredAt: string }[]): Promise<void> {
    if (!entries || entries.length === 0) return;

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const rows = entries.map((e) =>
      this.logRepo.create({
        displayAssignmentId,
        category: e.category,
        message: e.message,
        occurredAt: new Date(e.occurredAt),
        tenantId,
      }),
    );
    await this.logRepo.save(rows);
    await this._prune(displayAssignmentId);
  }

  private async _prune(displayAssignmentId: string): Promise<void> {
    const count = await this.logRepo.count({ where: { displayAssignmentId } });
    if (count <= MAX_LOGS_PER_DISPLAY) return;

    const excess = count - MAX_LOGS_PER_DISPLAY;
    const oldest = await this.logRepo.find({
      where: { displayAssignmentId },
      order: { occurredAt: 'ASC' },
      take: excess,
    });
    if (oldest.length > 0) {
      await this.logRepo.remove(oldest);
    }
  }

  // A5.5 API Contract Audit: feeds CmsDisplayService.getDiagnostics() (admin
  // GET /cms/displays/:id/diagnostics) -- explicit select excludes tenantId.
  async listRecent(displayAssignmentId: string, limit = 100): Promise<CMSPlayerLog[]> {
    return this.scopedLogRepo.find({
      where: { displayAssignmentId },
      order: { occurredAt: 'DESC' },
      take: limit,
      select: ['id', 'displayAssignmentId', 'category', 'message', 'occurredAt', 'receivedAt'],
    });
  }

  /** Time-based cleanup driven by CMSSettings.logRetentionDays; called from a cron
   *  (see CmsAssetCleanupService) rather than on every ingest for efficiency. */
  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.logRepo.delete({ occurredAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
