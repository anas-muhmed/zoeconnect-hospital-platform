import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { CvSection } from './entities/cv-section.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// Converted from `interface` to `class` + class-validator decorators -- see
// cv-class.service.ts's identical note on why (2026-08-03).
export class CreateSectionDto {
  @IsString()
  classId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CvSectionService {
  private readonly logger = new Logger(CvSectionService.name);

  constructor(
    @InjectRepository(CvSection)
    private readonly writeRepo: Repository<CvSection>,
    
    @Inject(getTenantScopedRepositoryToken(CvSection))
    private readonly readRepo: TenantScopedRepository<CvSection>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findAll(classId?: string): Promise<CvSection[]> {
    const whereClause: any = {};
    if (classId) {
      whereClause.classId = classId;
    }
    return this.readRepo.find({
      where: whereClause,
      order: { name: 'ASC' },
      relations: ['cvClass'],
    });
  }

  async findById(id: string): Promise<CvSection> {
    const section = await this.readRepo.findOne({
      where: { id },
      relations: ['cvClass'],
    });
    if (!section) {
      throw new NotFoundException(`Section ${id} not found`);
    }
    return section;
  }

  async create(data: CreateSectionDto, actorId: string): Promise<CvSection> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const hospitalId = await this.tenantContext.currentTenantIdOrNull();

    const section = this.writeRepo.create({
      ...data,
      isActive: data.isActive ?? true,
      createdBy: actorId,
      tenantId,
      hospitalId,
    });

    const saved = await this.writeRepo.save(section);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_SECTION_CREATED',
      entityType: 'cv_sections',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async update(id: string, data: UpdateSectionDto, actorId: string): Promise<CvSection> {
    await this.findById(id);

    await this.writeRepo.update(id, {
      ...data,
      updatedBy: actorId,
      updatedAt: new Date(),
    });

    const updated = await this.findById(id);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_SECTION_UPDATED',
      entityType: 'cv_sections',
      entityId: id,
      userId: actorId,
      metadata: { updates: data },
    });

    return updated;
  }
}
