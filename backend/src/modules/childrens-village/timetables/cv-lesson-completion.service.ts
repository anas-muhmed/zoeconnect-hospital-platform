import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CvLessonCompletionRecord, CvLessonCompletionStatus } from './entities/cv-lesson-completion-record.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

const COMPLETION_STATUSES: CvLessonCompletionStatus[] = [
  'COMPLETED', 'PARTIALLY_COMPLETED', 'NOT_COMPLETED', 'CANCELLED', 'SUBSTITUTED', 'MOVED', 'RESCHEDULED',
];

export class MarkLessonCompletionDto {
  @IsUUID()
  periodId: string;

  @IsDateString()
  date: string;

  @IsUUID()
  teacherId: string;

  @IsIn(COMPLETION_STATUSES)
  status: CvLessonCompletionStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  overrideId?: string;
}

/**
 * Phase 1 (Foundation) -- write/read path for `cv_lesson_completion_records`.
 * Marking is optional per the design brief: `findForPeriodAndDate` returning
 * `null` means "not yet marked", not an error -- Phase 10 (Lesson
 * Operations) will build the fuller history/reporting surface on top of
 * this; this phase only lands the table and the basic upsert.
 */
@Injectable()
export class CvLessonCompletionService {
  constructor(
    @InjectRepository(CvLessonCompletionRecord)
    private readonly writeRepo: Repository<CvLessonCompletionRecord>,

    @Inject(getTenantScopedRepositoryToken(CvLessonCompletionRecord))
    private readonly readRepo: TenantScopedRepository<CvLessonCompletionRecord>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findForPeriodAndDate(periodId: string, date: string): Promise<CvLessonCompletionRecord | null> {
    return this.readRepo.findOne({ where: { periodId, date } });
  }

  async mark(dto: MarkLessonCompletionDto, actorId: string): Promise<CvLessonCompletionRecord> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    let record = await this.findForPeriodAndDate(dto.periodId, dto.date);
    const isNew = !record;
    if (!record) {
      record = this.writeRepo.create({
        tenantId,
        periodId: dto.periodId,
        date: dto.date,
      });
    }

    record.teacherId = dto.teacherId;
    record.status = dto.status;
    record.notes = dto.notes ?? record.notes ?? null;
    record.overrideId = dto.overrideId ?? record.overrideId ?? null;
    record.markedBy = actorId;
    record.markedAt = new Date();

    const saved = await this.writeRepo.save(record);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: isNew ? 'CV_LESSON_COMPLETION_RECORDED' : 'CV_LESSON_COMPLETION_UPDATED',
      entityType: 'cv_lesson_completion_records',
      entityId: saved.id,
      userId: actorId,
      metadata: { periodId: dto.periodId, date: dto.date, status: dto.status },
    });

    return saved;
  }

  async listForTeacherAndRange(teacherId: string, from: string, to: string): Promise<CvLessonCompletionRecord[]> {
    // NB: TenantScopedRepository#createQueryBuilder is async (it awaits the
    // current tenant id before applying the scoping predicate) -- must be
    // awaited before chaining, unlike a raw TypeORM Repository.
    const qb = await this.readRepo.createQueryBuilder('record');
    return qb
      .where('record.teacherId = :teacherId', { teacherId })
      .andWhere('record.date BETWEEN :from AND :to', { from, to })
      .orderBy('record.date', 'ASC')
      .getMany();
  }
}
