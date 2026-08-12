import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvBehaviour } from './entities/cv-behaviour.entity';
import { CvHomeProgram } from './entities/cv-home-program.entity';
import { CvParentDiary } from './entities/cv-parent-diary.entity';

@Injectable()
export class CvDevelopmentService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,

    // Write Repositories
    @InjectRepository(CvBehaviour) private readonly behaviourWriteRepo: Repository<CvBehaviour>,
    @InjectRepository(CvHomeProgram) private readonly programWriteRepo: Repository<CvHomeProgram>,
    @InjectRepository(CvParentDiary) private readonly diaryWriteRepo: Repository<CvParentDiary>,

    // Read Repositories (Tenant Scoped)
    @Inject(getTenantScopedRepositoryToken(CvBehaviour)) private readonly behaviourReadRepo: TenantScopedRepository<CvBehaviour>,
    @Inject(getTenantScopedRepositoryToken(CvHomeProgram)) private readonly programReadRepo: TenantScopedRepository<CvHomeProgram>,
    @Inject(getTenantScopedRepositoryToken(CvParentDiary)) private readonly diaryReadRepo: TenantScopedRepository<CvParentDiary>,
  ) {}

  async logBehaviour(actorId: string, data: Partial<CvBehaviour>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const b = this.behaviourWriteRepo.create({ ...data, tenantId, reporterId: actorId });
    const saved = await this.behaviourWriteRepo.save(b);
    
    return saved;
  }

  async assignHomeProgram(actorId: string, data: Partial<CvHomeProgram>) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const hp = this.programWriteRepo.create({ ...data, tenantId, assignedBy: actorId, status: 'ASSIGNED' });
    const saved = await this.programWriteRepo.save(hp);
    
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'ASSIGN_HOME_PROGRAM',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_home_programs',
      metadata: { hpId: saved.id },
    });
    return saved;
  }

  async sendParentDiaryMessage(actorId: string, studentId: string, content: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const msg = this.diaryWriteRepo.create({
      tenantId,
      studentId,
      senderType: 'TEACHER',
      senderId: actorId,
      receiverType: 'PARENT',
      content,
      isRead: false,
      repliesEnabled: false // Phase 5 requirement
    });
    const saved = await this.diaryWriteRepo.save(msg);
    return saved;
  }

  async getDiaryMessagesForStudent(studentId: string) {
    return this.diaryReadRepo.find({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });
  }
}
