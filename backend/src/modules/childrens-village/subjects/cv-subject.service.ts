import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { CvSubject, SubjectCategory } from './entities/cv-subject.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// Converted from `interface` to `class` + class-validator decorators -- see
// cv-class.service.ts's identical note on why (2026-08-03).
export class CreateSubjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(SubjectCategory)
  category?: SubjectCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(SubjectCategory)
  category?: SubjectCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CvSubjectService {
  private readonly logger = new Logger(CvSubjectService.name);

  constructor(
    @InjectRepository(CvSubject)
    private readonly writeRepo: Repository<CvSubject>,
    
    @Inject(getTenantScopedRepositoryToken(CvSubject))
    private readonly readRepo: TenantScopedRepository<CvSubject>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findAll(category?: SubjectCategory): Promise<CvSubject[]> {
    const whereClause: any = {};
    if (category) {
      whereClause.category = category;
    }
    return this.readRepo.find({
      where: whereClause,
      order: { name: 'ASC' },
    });
  }

  async findById(id: string): Promise<CvSubject> {
    const subject = await this.readRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException(`Subject ${id} not found`);
    }
    return subject;
  }

  async create(data: CreateSubjectDto, actorId: string): Promise<CvSubject> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const hospitalId = await this.tenantContext.currentTenantIdOrNull();

    const existing = await this.readRepo.findOne({ where: { name: data.name } });
    if (existing) {
      throw new BadRequestException(`Subject with name ${data.name} already exists`);
    }

    const subject = this.writeRepo.create({
      ...data,
      isActive: data.isActive ?? true,
      createdBy: actorId,
      tenantId,
      hospitalId,
    });

    const saved = await this.writeRepo.save(subject);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_SUBJECT_CREATED',
      entityType: 'cv_subjects',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async update(id: string, data: UpdateSubjectDto, actorId: string): Promise<CvSubject> {
    const subject = await this.findById(id);

    if (data.name && data.name !== subject.name) {
      const existing = await this.readRepo.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new BadRequestException(`Subject with name ${data.name} already exists`);
      }
    }

    await this.writeRepo.update(id, {
      ...data,
      updatedBy: actorId,
      updatedAt: new Date(),
    });

    const updated = await this.findById(id);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_SUBJECT_UPDATED',
      entityType: 'cv_subjects',
      entityId: id,
      userId: actorId,
      metadata: { updates: data },
    });

    return updated;
  }
}
