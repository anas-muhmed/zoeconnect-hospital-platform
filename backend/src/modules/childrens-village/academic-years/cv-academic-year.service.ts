import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { CvAcademicYear } from './entities/cv-academic-year.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// Converted from `interface` to `class` + class-validator decorators -- see
// cv-class.service.ts's identical note on why (2026-08-03).
export class CreateAcademicYearDto {
  @IsString()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CvAcademicYearService {
  private readonly logger = new Logger(CvAcademicYearService.name);

  constructor(
    @InjectRepository(CvAcademicYear)
    private readonly writeRepo: Repository<CvAcademicYear>,
    
    @Inject(getTenantScopedRepositoryToken(CvAcademicYear))
    private readonly readRepo: TenantScopedRepository<CvAcademicYear>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findAll(): Promise<CvAcademicYear[]> {
    return this.readRepo.find({
      order: { startDate: 'DESC' },
    });
  }

  async findById(id: string): Promise<CvAcademicYear> {
    const year = await this.readRepo.findOne({ where: { id } });
    if (!year) {
      throw new NotFoundException(`Academic Year ${id} not found`);
    }
    return year;
  }

  async create(data: CreateAcademicYearDto, actorId: string): Promise<CvAcademicYear> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const hospitalId = await this.tenantContext.currentTenantIdOrNull();

    // Check if name already exists for this tenant
    const existing = await this.readRepo.findOne({ where: { name: data.name } });
    if (existing) {
      throw new BadRequestException(`Academic Year with name ${data.name} already exists`);
    }

    const year = this.writeRepo.create({
      ...data,
      isActive: data.isActive ?? true,
      createdBy: actorId,
      tenantId,
      hospitalId,
    });

    const saved = await this.writeRepo.save(year);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_ACADEMIC_YEAR_CREATED',
      entityType: 'cv_academic_years',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async update(id: string, data: UpdateAcademicYearDto, actorId: string): Promise<CvAcademicYear> {
    const year = await this.findById(id);

    if (data.name && data.name !== year.name) {
      const existing = await this.readRepo.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new BadRequestException(`Academic Year with name ${data.name} already exists`);
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
      action: 'CV_ACADEMIC_YEAR_UPDATED',
      entityType: 'cv_academic_years',
      entityId: id,
      userId: actorId,
      metadata: { updates: data },
    });

    return updated;
  }
}
