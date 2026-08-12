import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvCurriculumFramework } from './entities/cv-curriculum-framework.entity';
import { CvGrade } from './entities/cv-grade.entity';
import { CvCurriculumUnit } from './entities/cv-curriculum-unit.entity';
import { CvCurriculumTopic } from './entities/cv-curriculum-topic.entity';
import { CvCurriculumObjective } from './entities/cv-curriculum-objective.entity';
import { CvStudentCurriculumProgress } from './entities/cv-student-curriculum-progress.entity';

@Injectable()
export class CvCurriculumService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,

    // Write Repositories
    @InjectRepository(CvCurriculumFramework) private readonly fwWriteRepo: Repository<CvCurriculumFramework>,
    @InjectRepository(CvGrade) private readonly gradeWriteRepo: Repository<CvGrade>,
    @InjectRepository(CvCurriculumUnit) private readonly unitWriteRepo: Repository<CvCurriculumUnit>,
    @InjectRepository(CvCurriculumTopic) private readonly topicWriteRepo: Repository<CvCurriculumTopic>,
    @InjectRepository(CvCurriculumObjective) private readonly objWriteRepo: Repository<CvCurriculumObjective>,
    @InjectRepository(CvStudentCurriculumProgress) private readonly progressWriteRepo: Repository<CvStudentCurriculumProgress>,

    // Read Repositories (Tenant Scoped)
    @Inject(getTenantScopedRepositoryToken(CvCurriculumFramework)) private readonly fwReadRepo: TenantScopedRepository<CvCurriculumFramework>,
    @Inject(getTenantScopedRepositoryToken(CvGrade)) private readonly gradeReadRepo: TenantScopedRepository<CvGrade>,
    @Inject(getTenantScopedRepositoryToken(CvCurriculumUnit)) private readonly unitReadRepo: TenantScopedRepository<CvCurriculumUnit>,
    @Inject(getTenantScopedRepositoryToken(CvCurriculumTopic)) private readonly topicReadRepo: TenantScopedRepository<CvCurriculumTopic>,
    @Inject(getTenantScopedRepositoryToken(CvCurriculumObjective)) private readonly objReadRepo: TenantScopedRepository<CvCurriculumObjective>,
    @Inject(getTenantScopedRepositoryToken(CvStudentCurriculumProgress)) private readonly progressReadRepo: TenantScopedRepository<CvStudentCurriculumProgress>,
  ) {}

  async createFramework(actorId: string, data: Partial<CvCurriculumFramework>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const fw = this.fwWriteRepo.create({ ...data, tenantId, createdBy: actorId });
    const saved = await this.fwWriteRepo.save(fw);
    
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CREATE_CURRICULUM_FRAMEWORK',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_curriculum_frameworks',
      metadata: { fwId: saved.id },
    });
    return saved;
  }

  async getFrameworks() {
    return this.fwReadRepo.find({ order: { name: 'ASC' } });
  }

  async getCurriculumTreeForGrade(gradeId: string) {
    // Fetches Units -> Topics -> Objectives
    return this.unitReadRepo.find({
      where: { gradeId },
      relations: ['subject'],
      order: { sequenceOrder: 'ASC' },
    });
    // In a real app we'd load nested relations, but keeping it simple for now
  }

  async updateStudentProgress(actorId: string, studentId: string, objectiveId: string, status: string, notes?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    let progress = await this.progressReadRepo.findOne({ where: { studentId, objectiveId } });
    
    if (progress) {
      progress.status = status;
      if (notes) progress.notes = notes;
      progress.lastAssessedBy = actorId;
      await this.progressWriteRepo.save(progress);
    } else {
      progress = this.progressWriteRepo.create({
        tenantId,
        studentId,
        objectiveId,
        status,
        notes,
        lastAssessedBy: actorId
      });
      await this.progressWriteRepo.save(progress);
    }

    return progress;
  }
}
