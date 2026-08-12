import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CvTeacherAvailability, CvTeacherAvailabilitySeverity, CvTeacherAvailabilityType } from './entities/cv-teacher-availability.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

const AVAILABILITY_TYPES: CvTeacherAvailabilityType[] = [
  'ABSENT', 'LEAVE', 'TRAINING', 'MEETING', 'HOSPITAL_VISIT', 'THERAPY_SESSION', 'OFF_SITE_ASSIGNMENT', 'OTHER',
];
const AVAILABILITY_SEVERITIES: CvTeacherAvailabilitySeverity[] = ['HARD_BLOCK', 'SOFT_WARN'];

export class CreateTeacherAvailabilityDto {
  @IsUUID()
  teacherId: string;

  @IsIn(AVAILABILITY_TYPES)
  type: CvTeacherAvailabilityType;

  @IsOptional()
  @IsIn(AVAILABILITY_SEVERITIES)
  severity?: CvTeacherAvailabilitySeverity;

  @IsDateString()
  startDatetime: string;

  @IsDateString()
  endDatetime: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Phase 1 (Foundation) -- CRUD over `cv_teacher_availability`. Does NOT
 * yet feed the Conflict Engine (that's Phase 4) or drive substitute
 * suggestion (Phase 7) -- this phase only establishes the data model and
 * basic write/read paths those later phases will build on.
 */
@Injectable()
export class CvTeacherAvailabilityService {
  constructor(
    @InjectRepository(CvTeacherAvailability)
    private readonly writeRepo: Repository<CvTeacherAvailability>,

    @Inject(getTenantScopedRepositoryToken(CvTeacherAvailability))
    private readonly readRepo: TenantScopedRepository<CvTeacherAvailability>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(dto: CreateTeacherAvailabilityDto, actorId: string): Promise<CvTeacherAvailability> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const start = new Date(dto.startDatetime);
    const end = new Date(dto.endDatetime);
    if (end <= start) {
      throw new BadRequestException('endDatetime must be after startDatetime');
    }

    const record = this.writeRepo.create({
      tenantId,
      teacherId: dto.teacherId,
      type: dto.type,
      severity: dto.severity ?? 'HARD_BLOCK',
      startDatetime: start,
      endDatetime: end,
      reason: dto.reason ?? null,
      source: 'MANUAL',
      createdBy: actorId,
    });

    const saved = await this.writeRepo.save(record);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TEACHER_AVAILABILITY_RECORDED',
      entityType: 'cv_teacher_availability',
      entityId: saved.id,
      userId: actorId,
      metadata: { teacherId: dto.teacherId, type: dto.type, startDatetime: dto.startDatetime, endDatetime: dto.endDatetime },
    });

    return saved;
  }

  async listForTeacher(teacherId: string, from?: Date, to?: Date): Promise<CvTeacherAvailability[]> {
    const where: Record<string, unknown> = { teacherId };
    if (from) where['endDatetime'] = MoreThan(from);
    if (to) where['startDatetime'] = LessThan(to);
    return this.readRepo.find({ where, order: { startDatetime: 'ASC' } });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const record = await this.readRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Teacher availability record ${id} not found`);

    await this.writeRepo.delete(id);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_TEACHER_AVAILABILITY_REMOVED',
      entityType: 'cv_teacher_availability',
      entityId: id,
      userId: actorId,
      metadata: { teacherId: record.teacherId, type: record.type },
    });
  }
}
