import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSDisplayGroup } from '../entities/cms-display-group.entity';
import { CMSDisplayAssignment } from '../entities/cms-display-assignment.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CmsDisplayGroupService {
  constructor(
    @InjectRepository(CMSDisplayGroup)
    private readonly groupRepo: Repository<CMSDisplayGroup>,
    @InjectRepository(CMSDisplayAssignment)
    private readonly assignmentRepo: Repository<CMSDisplayAssignment>,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repositories for `list()`/
     * `findOne()`/`listMembers()` only. Every write path stays on
     * `groupRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(CMSDisplayGroup))
    private readonly scopedGroupRepo: TenantScopedRepository<CMSDisplayGroup>,
    @Inject(getTenantScopedRepositoryToken(CMSDisplayAssignment))
    private readonly scopedAssignmentRepo: TenantScopedRepository<CMSDisplayAssignment>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // A5.5 API Contract Audit: admin GET /cms/display-groups -- explicit select excludes tenantId.
  async list(branchId?: string): Promise<CMSDisplayGroup[]> {
    return this.scopedGroupRepo.find({
      where: branchId ? { branchId } : {},
      order: { name: 'ASC' },
      select: ['id', 'branchId', 'name', 'playlistId', 'createdBy', 'createdAt', 'updatedAt'],
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/display-groups/:id -- also backs
  // update()/remove() as a write-adjacent read; neither reads group.tenantId.
  async findOne(id: string): Promise<CMSDisplayGroup> {
    const group = await this.scopedGroupRepo.findOne({
      where: { id },
      select: ['id', 'branchId', 'name', 'playlistId', 'createdBy', 'createdAt', 'updatedAt'],
    });
    if (!group) throw new NotFoundException(`Display group "${id}" not found`);
    return group;
  }

  async create(data: { branchId: string | null; name: string; playlistId?: string | null; createdBy: string }): Promise<CMSDisplayGroup> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const group = this.groupRepo.create({ ...data, tenantId });
    const saved = await this.groupRepo.save(group);
    await this.auditService.log({
      entityType: 'CMSDisplayGroup', entityId: saved.id, action: 'CREATE',
      changedBy: data.createdBy, branchId: data.branchId, summary: `Created screen group "${saved.name}"`,
    });
    return saved;
  }

  async update(id: string, data: { name?: string; playlistId?: string | null }, changedBy = 'unknown'): Promise<CMSDisplayGroup> {
    const group = await this.findOne(id);
    if (data.name !== undefined) group.name = data.name;
    if (data.playlistId !== undefined) group.playlistId = data.playlistId;
    const saved = await this.groupRepo.save(group);
    await this.auditService.log({
      entityType: 'CMSDisplayGroup', entityId: id, action: 'UPDATE',
      changedBy, summary: `Updated screen group "${saved.name}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy = 'unknown'): Promise<void> {
    const group = await this.findOne(id);
    // Displays in this group simply fall back to their own playlistId (FK is ON DELETE SET NULL).
    await this.groupRepo.remove(group);
    await this.auditService.log({
      entityType: 'CMSDisplayGroup', entityId: id, action: 'DELETE',
      changedBy, summary: `Deleted screen group "${group.name}"`,
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/display-groups/:id/members -- explicit select excludes tenantId.
  async listMembers(groupId: string): Promise<CMSDisplayAssignment[]> {
    await this.findOne(groupId);
    return this.scopedAssignmentRepo.find({
      where: { groupId },
      select: [
        'id', 'branchId', 'name', 'slug', 'playlistId', 'isActive', 'lastSeenAt', 'lastSeenIp',
        'isPlayerOnline', 'currentPlaylistId', 'currentItemLabel', 'currentVersionNumber',
        'lastSyncAt', 'cacheStatus', 'lastError', 'storageUsageBytes', 'groupId', 'tags',
        'maintenanceMode', 'maintenanceMessage', 'isPaused', 'tickerEnabled', 'tickerPosition',
        'tickerSpeed', 'tickerBackgroundColor', 'tickerTextColor', 'tickerFontSize', 'tickerSeparator',
        'createdBy', 'createdAt', 'updatedAt',
      ],
    });
  }
}
