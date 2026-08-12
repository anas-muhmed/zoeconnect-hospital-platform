import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CMSEmergencyBroadcast } from '../entities/cms-emergency-broadcast.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CmsEmergencyService {
  constructor(
    @InjectRepository(CMSEmergencyBroadcast)
    private readonly emergencyRepo: Repository<CMSEmergencyBroadcast>,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `listActive()`/
     * `listHistory()` only. `getActive()` stays raw — chain-resolved,
     * reached exclusively from `getActiveContent()`'s anonymous player
     * chain, deferred to B5. Every write path stays raw too.
     */
    @Inject(getTenantScopedRepositoryToken(CMSEmergencyBroadcast))
    private readonly scopedEmergencyRepo: TenantScopedRepository<CMSEmergencyBroadcast>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /** Returns the currently-active emergency broadcast for a branch, preferring a
   *  branch-specific broadcast over a global (branchId=null) one, or null if none. */
  async getActive(branchId: string | null): Promise<CMSEmergencyBroadcast | null> {
    if (branchId) {
      const scoped = await this.emergencyRepo.findOne({
        where: { branchId, isActive: true },
        order: { activatedAt: 'DESC' },
      });
      if (scoped) return scoped;
    }
    return this.emergencyRepo.findOne({
      where: { branchId: IsNull(), isActive: true },
      order: { activatedAt: 'DESC' },
    });
  }

  private static readonly SELECT = [
    'id', 'branchId', 'playlistId', 'message', 'isActive', 'activatedBy',
    'activatedAt', 'deactivatedBy', 'deactivatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /cms/emergency/active -- explicit select excludes tenantId.
  async listActive(branchId: string): Promise<CMSEmergencyBroadcast[]> {
    return this.scopedEmergencyRepo.find({
      where: { isActive: true, branchId },
      order: { activatedAt: 'DESC' },
      select: [...CmsEmergencyService.SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/emergency/history -- explicit select excludes tenantId.
  async listHistory(branchId: string, limit = 50): Promise<CMSEmergencyBroadcast[]> {
    return this.scopedEmergencyRepo.find({
      where: { branchId },
      order: { activatedAt: 'DESC' },
      take: limit,
      select: [...CmsEmergencyService.SELECT],
    });
  }

  async activate(data: { branchId: string | null; playlistId: string; message: string }, activatedBy: string): Promise<CMSEmergencyBroadcast> {
    // Deactivate any existing active broadcast in the same scope first (append-only history preserved).
    const existing = await this.emergencyRepo.find({ where: { branchId: data.branchId ?? IsNull(), isActive: true } as any });
    for (const row of existing) {
      row.isActive = false;
      row.deactivatedBy = activatedBy;
      row.deactivatedAt = new Date();
      await this.emergencyRepo.save(row);
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const broadcast = this.emergencyRepo.create({
      branchId: data.branchId,
      playlistId: data.playlistId,
      message: data.message,
      isActive: true,
      activatedBy,
      tenantId,
    });
    const saved = await this.emergencyRepo.save(broadcast);

    await this.auditService.log({
      entityType: 'CMSEmergencyBroadcast', entityId: saved.id, action: 'CREATE',
      changedBy: activatedBy, summary: `Emergency broadcast activated: "${data.message}"`,
    });
    return saved;
  }

  async deactivate(id: string, deactivatedBy: string): Promise<CMSEmergencyBroadcast> {
    const broadcast = await this.emergencyRepo.findOne({ where: { id } });
    if (!broadcast) throw new NotFoundException(`Emergency broadcast "${id}" not found`);
    broadcast.isActive = false;
    broadcast.deactivatedBy = deactivatedBy;
    broadcast.deactivatedAt = new Date();
    const saved = await this.emergencyRepo.save(broadcast);

    await this.auditService.log({
      entityType: 'CMSEmergencyBroadcast', entityId: saved.id, action: 'UPDATE',
      changedBy: deactivatedBy, summary: `Emergency broadcast deactivated: "${broadcast.message}"`,
    });
    return saved;
  }
}
