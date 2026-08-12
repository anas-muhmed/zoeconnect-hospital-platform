import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EicPreschoolEnrollment } from '../entities/eic-preschool-enrollment.entity';
import { EicPreschoolAssessment } from '../entities/eic-preschool-assessment.entity';
import { EicPreschoolDailyReport } from '../entities/eic-preschool-daily-report.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EicPreschoolService {
  private readonly logger = new Logger(EicPreschoolService.name);

  constructor(
    @InjectRepository(EicPreschoolEnrollment)
    private readonly enrollmentRepo: Repository<EicPreschoolEnrollment>,

    @InjectRepository(EicPreschoolAssessment)
    private readonly assessmentRepo: Repository<EicPreschoolAssessment>,

    @InjectRepository(EicPreschoolDailyReport)
    private readonly dailyReportRepo: Repository<EicPreschoolDailyReport>,

    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,

    /**
     * Stage B (Checkpoint B3.5) — scoped repositories for `findAll()`/
     * `findById()`/`getAssessmentHistory()`/`getDailyReports()` only. Every
     * write path (`enroll`, `saveAssessment`, `startReassessment`,
     * `submitDailyReport`) stays on `enrollmentRepo`/`assessmentRepo`/
     * `dailyReportRepo` above. `getBackdateLimitDays()`/`setBackdateLimitDays()`
     * touch the unrelated global `settings` table — out of scope entirely.
     */
    @Inject(getTenantScopedRepositoryToken(EicPreschoolEnrollment))
    private readonly scopedEnrollmentRepo: TenantScopedRepository<EicPreschoolEnrollment>,
    @Inject(getTenantScopedRepositoryToken(EicPreschoolAssessment))
    private readonly scopedAssessmentRepo: TenantScopedRepository<EicPreschoolAssessment>,
    @Inject(getTenantScopedRepositoryToken(EicPreschoolDailyReport))
    private readonly scopedDailyReportRepo: TenantScopedRepository<EicPreschoolDailyReport>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Enrollment ──────────────────────────────────────────────────────────────

  async findAll(q?: string): Promise<EicPreschoolEnrollment[]> {
    let enrollments: EicPreschoolEnrollment[];
    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      const qb = await this.scopedEnrollmentRepo.createQueryBuilder('e');
      enrollments = await qb
        .leftJoinAndSelect('e.patient', 'p')
        .where('p.full_name ILIKE :term OR p.mrn ILIKE :term OR e.enrollment_number ILIKE :term', { term })
        .orderBy('e.created_at', 'DESC')
        .take(50)
        .getMany();
    } else {
      enrollments = await this.scopedEnrollmentRepo.find({
        relations: ['patient'],
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }
    // A5.5 API Contract Audit: backs GET /eic/preschool -- eager `patient`
    // relation (also carrying its own tenantId) makes an explicit .select()
    // column list impractical, so strip post-fetch on both branches.
    for (const e of enrollments) {
      delete (e as { tenantId?: string | null }).tenantId;
      if (e.patient) delete (e.patient as { tenantId?: string | null }).tenantId;
    }
    return enrollments;
  }

  async enroll(
    patientId: string,
    data: {
      admissionDate: string;
      classGroup?: string;
      teacherId?: string;
      teacherName?: string;
      notes?: string;
    },
    actorId: string,
  ): Promise<EicPreschoolEnrollment> {
    const enrollmentNumber = await this.generateEnrollmentNumber();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const enrollment = this.enrollmentRepo.create({
      patientId,
      enrollmentNumber,
      admissionDate: data.admissionDate,
      classGroup:    data.classGroup ?? null,
      teacherId:     data.teacherId ?? null,
      teacherName:   data.teacherName ?? null,
      notes:         data.notes ?? null,
      createdBy:     actorId,
      status:        'ACTIVE',
      tenantId,
    });

    const saved = await this.enrollmentRepo.save(enrollment);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PRESCHOOL_ENROLLED',
      entityType: 'eic_preschool_enrollments',
      entityId:   saved.id,
      userId:     actorId,
      metadata:   { patientId, enrollmentNumber },
    });

    return saved;
  }

  async findById(id: string): Promise<EicPreschoolEnrollment> {
    const enrollment = await this.scopedEnrollmentRepo.findOne({
      where: { id },
      relations: ['patient'],
    });
    if (!enrollment) throw new NotFoundException(`Preschool enrollment ${id} not found`);

    // Load current assessment separately
    const currentAssessment = await this.assessmentRepo.findOne({
      where: { preschoolEnrollmentId: id, isCurrent: true },
      order: { assessmentNumber: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/preschool/:enrollId -- eager
    // `patient` relation and the attached `currentAssessment` each carry
    // their own tenantId; strip post-fetch instead of an impractical
    // hand-crafted .select() list.
    delete (enrollment as { tenantId?: string | null }).tenantId;
    if (enrollment.patient) delete (enrollment.patient as { tenantId?: string | null }).tenantId;
    if (currentAssessment) delete (currentAssessment as { tenantId?: string | null }).tenantId;
    (enrollment as any).assessment = currentAssessment ?? null;

    return enrollment;
  }

  // ── Assessment ──────────────────────────────────────────────────────────────

  /** Save or update the current (latest) assessment. */
  async saveAssessment(
    preschoolEnrollmentId: string,
    data: Partial<EicPreschoolAssessment>,
    actorId: string,
  ): Promise<EicPreschoolAssessment> {
    const existing = await this.assessmentRepo.findOne({
      where: { preschoolEnrollmentId, isCurrent: true },
      order: { assessmentNumber: 'DESC' },
    });

    if (existing) {
      await this.assessmentRepo.update(existing.id, { ...data, assessedBy: actorId } as any);
      return this.assessmentRepo.findOneOrFail({ where: { id: existing.id } });
    }

    // First assessment for this enrollment
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const assessment = this.assessmentRepo.create({
      ...data,
      preschoolEnrollmentId,
      assessedBy:       actorId,
      assessmentDate:   data.assessmentDate ?? new Date().toISOString().split('T')[0],
      isCurrent:        true,
      assessmentNumber: 1,
      tenantId,
    });

    return this.assessmentRepo.save(assessment);
  }

  /**
   * Start a re-assessment: marks current as historical, creates a blank new current.
   * The new assessment pre-populates assessor and date; the teacher fills in the form.
   */
  async startReassessment(
    preschoolEnrollmentId: string,
    actorId: string,
  ): Promise<EicPreschoolAssessment> {
    const current = await this.assessmentRepo.findOne({
      where: { preschoolEnrollmentId, isCurrent: true },
      order: { assessmentNumber: 'DESC' },
    });

    if (!current) {
      throw new BadRequestException('No current assessment found. Complete an initial assessment first.');
    }

    const nextNumber = current.assessmentNumber + 1;

    // Archive the current
    await this.assessmentRepo.update(current.id, { isCurrent: false });

    // Create new blank assessment
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const reassessment = this.assessmentRepo.create({
      preschoolEnrollmentId,
      assessedBy:       actorId,
      assessmentDate:   new Date().toISOString().split('T')[0],
      isCurrent:        true,
      assessmentNumber: nextNumber,
      status:           'DRAFT',
      tenantId,
    });

    const saved = await this.assessmentRepo.save(reassessment);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PRESCHOOL_REASSESSMENT_STARTED',
      entityType: 'eic_preschool_assessments',
      entityId:   saved.id,
      userId:     actorId,
      metadata:   { preschoolEnrollmentId, assessmentNumber: nextNumber },
    });

    return saved;
  }

  /** Return all assessments for an enrollment ordered newest first. */
  async getAssessmentHistory(preschoolEnrollmentId: string): Promise<EicPreschoolAssessment[]> {
    const assessments = await this.scopedAssessmentRepo.find({
      where: { preschoolEnrollmentId },
      order: { assessmentNumber: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/preschool/:enrollId/assessment-history.
    assessments.forEach((a) => delete (a as { tenantId?: string | null }).tenantId);
    return assessments;
  }

  // ── Daily Reports ───────────────────────────────────────────────────────────

  async getDailyReports(
    preschoolEnrollmentId: string,
    month?: string,
  ): Promise<EicPreschoolDailyReport[]> {
    const qb = (await this.scopedDailyReportRepo.createQueryBuilder('r'))
      .where('r.preschool_enrollment_id = :id', { id: preschoolEnrollmentId })
      .orderBy('r.report_date', 'DESC');

    if (month) {
      qb.andWhere("TO_CHAR(r.report_date, 'YYYY-MM') = :month", { month });
    }

    const reports = await qb.getMany();
    // A5.5 API Contract Audit: backs GET /eic/preschool/:enrollId/daily-reports
    // -- strip tenantId post-fetch (query-builder .getMany() makes an
    // explicit .select() column list impractical here).
    reports.forEach((r) => delete (r as { tenantId?: string | null }).tenantId);
    return reports;
  }

  async submitDailyReport(
    preschoolEnrollmentId: string,
    data: Partial<EicPreschoolDailyReport>,
    actorId: string,
  ): Promise<EicPreschoolDailyReport> {
    // FR-063: back-date limit (configurable, 0 = no limit)
    const limitDays = await this.getBackdateLimitDays();
    if (limitDays > 0 && data.reportDate) {
      const reportDate = new Date(data.reportDate);
      reportDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - reportDate.getTime()) / 86_400_000);
      if (diffDays > limitDays) {
        throw new BadRequestException(
          `Daily reports cannot be submitted more than ${limitDays} day${limitDays !== 1 ? 's' : ''} after the session date. Contact your administrator to change this setting.`,
        );
      }
      if (diffDays < 0) {
        throw new BadRequestException('Daily reports cannot be submitted for a future date.');
      }
    }

    const existing = await this.dailyReportRepo.findOne({
      where: { preschoolEnrollmentId, reportDate: data.reportDate! },
    });

    if (existing) {
      await this.dailyReportRepo.update(existing.id, {
        ...data,
        submittedBy: actorId,
        submittedAt: new Date(),
      } as any);
      return this.dailyReportRepo.findOneOrFail({ where: { id: existing.id } });
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const report = this.dailyReportRepo.create({
      ...data,
      preschoolEnrollmentId,
      submittedBy: actorId,
      submittedAt: new Date(),
      tenantId,
    });

    return this.dailyReportRepo.save(report);
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  /** Fetch the backdate limit from settings table. Returns 7 as default if not set. */
  async getBackdateLimitDays(): Promise<number> {
    try {
      const row = await this.dataSource.query<Array<{ value: string }>>(
        `SELECT "value" FROM "settings" WHERE "module" = 'EIC' AND "key" = 'preschool.backdate_limit_days' LIMIT 1`,
      );
      if (row.length > 0) {
        const n = parseInt(row[0].value, 10);
        return isNaN(n) ? 7 : n;
      }
    } catch {
      this.logger.warn('Could not read backdate limit setting — defaulting to 7 days');
    }
    return 7;
  }

  /** Update the backdate limit (superadmin only — enforced at controller level). */
  async setBackdateLimitDays(days: number, actorId: string): Promise<void> {
    if (days < 0) throw new BadRequestException('Backdate limit must be 0 or greater.');
    await this.dataSource.query(
      `INSERT INTO "settings" ("id", "module", "key", "value", "data_type", "description", "updated_by")
       VALUES (gen_random_uuid(), 'EIC', 'preschool.backdate_limit_days', $1, 'integer',
               'Maximum days back a preschool daily report can be submitted. 0 = no limit.', $2)
       ON CONFLICT ("module", "key") DO UPDATE
         SET "value" = $1, "updated_by" = $2, "updated_at" = now()`,
      [String(days), actorId],
    );
    this.logger.log(`Backdate limit updated to ${days} days by ${actorId}`);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async generateEnrollmentNumber(): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.enrollmentRepo.count();
    const seq   = String(count + 1).padStart(4, '0');
    return `PS-${year}-${seq}`;
  }
}
