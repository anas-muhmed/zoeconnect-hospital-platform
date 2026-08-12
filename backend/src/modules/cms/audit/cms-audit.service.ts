import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSAuditLog, CmsAuditAction } from '../entities/cms-audit-log.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CmsAuditService {
  constructor(
    @InjectRepository(CMSAuditLog)
    private readonly auditRepo: Repository<CMSAuditLog>,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `listForEntity()`/
     * `listRecent()` only. `log()` (write) stays on `auditRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(CMSAuditLog))
    private readonly scopedAuditRepo: TenantScopedRepository<CMSAuditLog>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /**
   * Fire-and-forget audit write -- never throws, so a logging failure can't
   * block the actual operation. Uses `requireTenantContext()` (not
   * `currentTenantIdOrNull()`) so a missing tenant context fails this write
   * loudly enough to be caught by the surrounding try/catch and simply skip
   * the audit row, rather than silently persisting `tenant_id = NULL` --
   * defense-in-depth against a future controller reaching this method
   * without `TenantContextInterceptor`, the exact shape of the
   * `CmsSettingsController` gap found and fixed 2026-08-07 (see
   * HYBRID_ARCHITECTURE_LOG.md). Every current caller already has an
   * interceptor covering it (or, in `CmsAssetCleanupService`, manually
   * establishes context via `TenantContextStorage.run()`), so this should
   * never actually skip a row in practice today.
   */
  async log(entry: {
    entityType: string;
    entityId: string | null;
    action: CmsAuditAction;
    changedBy: string;
    branchId?: string | null;
    summary?: string | null;
  }): Promise<void> {
    try {
      const tenantId = await this.tenantContext.requireTenantContext();
      const row = this.auditRepo.create({
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        changedBy: entry.changedBy,
        branchId: entry.branchId ?? null,
        summary: entry.summary ?? null,
        tenantId,
      });
      await this.auditRepo.save(row);
    } catch {
      // Auditing must never break the underlying CMS operation.
    }
  }

  private static readonly SELECT = [
    'id', 'branchId', 'entityType', 'entityId', 'action', 'summary', 'changedBy', 'changedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /cms/audit-logs?entityType=&entityId= -- explicit select excludes tenantId.
  async listForEntity(entityType: string, entityId: string): Promise<CMSAuditLog[]> {
    return this.scopedAuditRepo.find({
      where: { entityType, entityId },
      order: { changedAt: 'DESC' },
      select: [...CmsAuditService.SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/audit-logs -- explicit select excludes tenantId.
  async listRecent(branchId?: string, limit = 100): Promise<CMSAuditLog[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    return this.scopedAuditRepo.find({
      where,
      order: { changedAt: 'DESC' },
      take: limit,
      select: [...CmsAuditService.SELECT],
    });
  }
}
