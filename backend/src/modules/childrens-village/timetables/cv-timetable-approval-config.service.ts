import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { CvApprovalMode, CvTimetableApprovalConfig } from './entities/cv-timetable-approval-config.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

const APPROVAL_MODES: CvApprovalMode[] = ['DISABLED', 'SINGLE', 'TWO_LEVEL', 'MULTI_LEVEL'];

export class UpsertApprovalConfigDto {
  @IsString()
  changeType: string;

  @IsIn(APPROVAL_MODES)
  approvalMode: CvApprovalMode;

  @IsOptional()
  @IsUUID()
  workflowTemplateId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/**
 * Phase 1 (Foundation) -- storage-only service for
 * `cv_timetable_approval_config`. `approvalMode` defaults to 'DISABLED' at
 * the DB level, so a tenant with no row for a given `changeType` is
 * correctly treated as "approval disabled" by `getEffectiveConfig`, not an
 * error. The actual workflow-engine integration (resolving
 * `workflowTemplateId` into a running `WorkflowInstance`) is Phase 6 work
 * and is NOT implemented here -- this phase only lands the configuration
 * surface those later phases will read from.
 */
@Injectable()
export class CvTimetableApprovalConfigService {
  constructor(
    @InjectRepository(CvTimetableApprovalConfig)
    private readonly writeRepo: Repository<CvTimetableApprovalConfig>,

    @Inject(getTenantScopedRepositoryToken(CvTimetableApprovalConfig))
    private readonly readRepo: TenantScopedRepository<CvTimetableApprovalConfig>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async getEffectiveConfig(changeType: string): Promise<CvTimetableApprovalConfig | null> {
    return this.readRepo.findOne({ where: { changeType } });
  }

  async listAll(): Promise<CvTimetableApprovalConfig[]> {
    return this.readRepo.find({ order: { changeType: 'ASC' } });
  }

  async upsert(dto: UpsertApprovalConfigDto, actorId: string): Promise<CvTimetableApprovalConfig> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    let entry = await this.getEffectiveConfig(dto.changeType);
    const isNew = !entry;
    if (!entry) {
      entry = this.writeRepo.create({ tenantId, changeType: dto.changeType });
    }

    entry.approvalMode = dto.approvalMode;
    entry.workflowTemplateId = dto.workflowTemplateId ?? null;
    entry.config = dto.config ?? entry.config ?? {};
    entry.updatedBy = actorId;
    if (isNew) entry.createdBy = actorId;

    const saved = await this.writeRepo.save(entry);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TIMETABLE_APPROVAL_CONFIG_CHANGED',
      entityType: 'cv_timetable_approval_config',
      entityId: saved.id,
      userId: actorId,
      metadata: { changeType: dto.changeType, approvalMode: dto.approvalMode },
    });

    return saved;
  }
}
