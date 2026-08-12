import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CvClassSubjectTeacher } from './entities/cv-class-subject-teacher.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export class AssignSubjectTeacherDto {
  @IsUUID()
  classId: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  teacherId: string;

  @IsUUID()
  academicYearId: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

/**
 * Phase 1 (Foundation) -- CRUD over `cv_class_subject_teachers`, the new
 * source of truth for "which teacher(s) may teach subject X for class Y".
 * Consumed by the Timetable Authoring UI (Phase 3+, to populate valid
 * teacher choices) and the Conflict/Eligibility Engine (Phase 4/5, to flag
 * assignments outside a teacher's declared subjects).
 */
@Injectable()
export class CvClassSubjectTeacherService {
  constructor(
    @InjectRepository(CvClassSubjectTeacher)
    private readonly writeRepo: Repository<CvClassSubjectTeacher>,

    @Inject(getTenantScopedRepositoryToken(CvClassSubjectTeacher))
    private readonly readRepo: TenantScopedRepository<CvClassSubjectTeacher>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async assign(dto: AssignSubjectTeacherDto, actorId: string): Promise<CvClassSubjectTeacher> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const assignment = this.writeRepo.create({
      tenantId,
      classId: dto.classId,
      subjectId: dto.subjectId,
      teacherId: dto.teacherId,
      academicYearId: dto.academicYearId,
      isPrimary: dto.isPrimary ?? false,
      effectiveFrom: dto.effectiveFrom ?? null,
      effectiveTo: dto.effectiveTo ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });

    const saved = await this.writeRepo.save(assignment);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASS_SUBJECT_TEACHER_ASSIGNED',
      entityType: 'cv_class_subject_teachers',
      entityId: saved.id,
      userId: actorId,
      metadata: { classId: dto.classId, subjectId: dto.subjectId, teacherId: dto.teacherId },
    });

    return saved;
  }

  async listForClass(classId: string, academicYearId?: string): Promise<CvClassSubjectTeacher[]> {
    return this.readRepo.find({
      where: academicYearId ? { classId, academicYearId } : { classId },
      relations: ['subject'],
    });
  }

  async listForTeacher(teacherId: string): Promise<CvClassSubjectTeacher[]> {
    return this.readRepo.find({ where: { teacherId }, relations: ['cvClass', 'subject'] });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const assignment = await this.readRepo.findOne({ where: { id } });
    if (!assignment) throw new NotFoundException(`Subject teacher assignment ${id} not found`);

    await this.writeRepo.delete(id);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASS_SUBJECT_TEACHER_REMOVED',
      entityType: 'cv_class_subject_teachers',
      entityId: id,
      userId: actorId,
      metadata: { classId: assignment.classId, subjectId: assignment.subjectId, teacherId: assignment.teacherId },
    });
  }
}
