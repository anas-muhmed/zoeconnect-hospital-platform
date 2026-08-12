import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvIepDomain } from './entities/cv-iep-domain.entity';
import { CvIep } from './entities/cv-iep.entity';
import { CvIepGoal } from './entities/cv-iep-goal.entity';
import { CvIepReview } from './entities/cv-iep-review.entity';

@Injectable()
export class CvIepService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,

    // Write Repositories
    @InjectRepository(CvIepDomain) private readonly domainWriteRepo: Repository<CvIepDomain>,
    @InjectRepository(CvIep) private readonly iepWriteRepo: Repository<CvIep>,
    @InjectRepository(CvIepGoal) private readonly goalWriteRepo: Repository<CvIepGoal>,
    @InjectRepository(CvIepReview) private readonly reviewWriteRepo: Repository<CvIepReview>,

    // Read Repositories (Tenant Scoped)
    @Inject(getTenantScopedRepositoryToken(CvIepDomain)) private readonly domainReadRepo: TenantScopedRepository<CvIepDomain>,
    @Inject(getTenantScopedRepositoryToken(CvIep)) private readonly iepReadRepo: TenantScopedRepository<CvIep>,
    @Inject(getTenantScopedRepositoryToken(CvIepGoal)) private readonly goalReadRepo: TenantScopedRepository<CvIepGoal>,
    @Inject(getTenantScopedRepositoryToken(CvIepReview)) private readonly reviewReadRepo: TenantScopedRepository<CvIepReview>,
  ) {}

  async createIep(actorId: string, data: Partial<CvIep>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const iep = this.iepWriteRepo.create({ ...data, tenantId, createdBy: actorId, status: 'DRAFT', version: 1 });
    const saved = await this.iepWriteRepo.save(iep);
    
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CREATE_IEP',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_ieps',
      metadata: { iepId: saved.id },
    });
    return saved;
  }

  async submitIepReview(actorId: string, iepId: string, reviewerId: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const iep = await this.iepReadRepo.findOne({ where: { id: iepId } });
    if (!iep) throw new NotFoundException('IEP not found');

    iep.status = 'UNDER_REVIEW';
    const saved = await this.iepWriteRepo.save(iep);
    return saved;
  }

  async approveIep(actorId: string, iepId: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const iep = await this.iepReadRepo.findOne({ where: { id: iepId } });
    if (!iep) throw new NotFoundException('IEP not found');

    iep.status = 'APPROVED';
    iep.approvalDate = new Date();
    iep.reviewerId = actorId;
    const saved = await this.iepWriteRepo.save(iep);
    return saved;
  }

  async logGoalReview(actorId: string, goalId: string, progressNotes: string, statusUpdate?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const review = this.reviewWriteRepo.create({
      tenantId,
      goalId,
      reviewerId: actorId,
      reviewDate: new Date(),
      progressNotes,
      statusUpdate
    });
    
    await this.reviewWriteRepo.save(review);

    if (statusUpdate) {
      const goal = await this.goalReadRepo.findOne({ where: { id: goalId } });
      if (goal) {
        goal.status = statusUpdate;
        await this.goalWriteRepo.save(goal);
      }
    }

    return review;
  }

  async getActiveIepForStudent(studentId: string) {
    return this.iepReadRepo.findOne({
      where: { studentId, status: 'ACTIVE' },
      order: { version: 'DESC' }
    });
  }
}
