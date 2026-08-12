import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { CvTeacherProfile } from './entities/cv-teacher-profile.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export class UpsertTeacherProfileDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  subjectsQualified?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPeriodsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPeriodsPerWeek?: number;

  @IsOptional()
  @IsBoolean()
  isSubstituteEligible?: boolean;
}

/**
 * Phase 1 (Foundation) -- thin CRUD over `cv_teacher_profiles`. Profiles
 * are upserted lazily: there is deliberately no "onboard a teacher" step
 * elsewhere in the codebase to hook into, so `upsertForUser` creates the
 * row on first write rather than requiring pre-provisioning.
 */
@Injectable()
export class CvTeacherProfileService {
  private readonly logger = new Logger(CvTeacherProfileService.name);

  constructor(
    @InjectRepository(CvTeacherProfile)
    private readonly writeRepo: Repository<CvTeacherProfile>,

    @Inject(getTenantScopedRepositoryToken(CvTeacherProfile))
    private readonly readRepo: TenantScopedRepository<CvTeacherProfile>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findByUserId(userId: string): Promise<CvTeacherProfile | null> {
    return this.readRepo.findOne({ where: { userId } });
  }

  async getOrCreateByUserId(userId: string): Promise<CvTeacherProfile> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const created = this.writeRepo.create({ tenantId, userId });
    return this.writeRepo.save(created);
  }

  async upsertForUser(dto: UpsertTeacherProfileDto, actorId: string): Promise<CvTeacherProfile> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    let profile = await this.findByUserId(dto.userId);
    const isNew = !profile;
    if (!profile) {
      profile = this.writeRepo.create({ tenantId, userId: dto.userId });
    }

    if (dto.subjectsQualified !== undefined) profile.subjectsQualified = dto.subjectsQualified;
    if (dto.maxPeriodsPerDay !== undefined) profile.maxPeriodsPerDay = dto.maxPeriodsPerDay;
    if (dto.maxPeriodsPerWeek !== undefined) profile.maxPeriodsPerWeek = dto.maxPeriodsPerWeek;
    if (dto.isSubstituteEligible !== undefined) profile.isSubstituteEligible = dto.isSubstituteEligible;

    const saved = await this.writeRepo.save(profile);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: isNew ? 'CV_TEACHER_PROFILE_CREATED' : 'CV_TEACHER_PROFILE_UPDATED',
      entityType: 'cv_teacher_profiles',
      entityId: saved.id,
      userId: actorId,
      metadata: { targetUserId: dto.userId },
    });

    return saved;
  }

  async findAll(): Promise<CvTeacherProfile[]> {
    return this.readRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findByIdOrThrow(id: string): Promise<CvTeacherProfile> {
    const profile = await this.readRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Teacher profile ${id} not found`);
    return profile;
  }
}
