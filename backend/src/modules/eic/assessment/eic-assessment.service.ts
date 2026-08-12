import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EicAssessment } from '../entities/eic-assessment.entity';
import { AuditService } from '../../audit/audit.service';
import { EicAssessmentStatus } from '../common/enums/assessment-status.enum';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface CreateAssessmentDto {
  discipline: EicDiscipline;
  therapistId: string;
  therapistName: string;
  assessmentType?: string;
  parentAssessmentId?: string;
}

export interface UpdateAssessmentDto {
  socioDemographic?: Record<string, unknown>;
  backgroundHistory?: Record<string, unknown>;
  clinicalObservations?: Record<string, unknown>;
  formalEvaluations?: Record<string, unknown>;
  assessmentToolScores?: Array<{ tool: string; score: number | string; interpretation: string }>;
  recommendations?: string;
  goalsSection?: Record<string, unknown>;
  additionalNotes?: string;
}

@Injectable()
export class EicAssessmentService {
  private readonly logger = new Logger(EicAssessmentService.name);

  constructor(
    @InjectRepository(EicAssessment)
    private readonly assessmentRepo: Repository<EicAssessment>,
    private readonly auditService: AuditService,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findByEnrollment()`,
     * `findAwaitingReview()`, `findById()` only. Every write path stays on
     * `assessmentRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicAssessment))
    private readonly scopedAssessmentRepo: TenantScopedRepository<EicAssessment>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(enrollmentId: string, dto: CreateAssessmentDto, actorId: string): Promise<EicAssessment> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const assessment = this.assessmentRepo.create({
      enrollmentId,
      discipline:        dto.discipline,
      therapistId:       dto.therapistId,
      therapistName:     dto.therapistName,
      assessmentType:    dto.assessmentType ?? 'INITIAL',
      parentAssessmentId: dto.parentAssessmentId ?? null,
      status:            EicAssessmentStatus.DRAFT,
      tenantId,
    });

    const saved = await this.assessmentRepo.save(assessment);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_ASSESSMENT_CREATED',
      entityType: 'eic_assessments',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { enrollmentId, discipline: dto.discipline },
    });

    return saved;
  }

  async findByEnrollment(enrollmentId: string): Promise<EicAssessment[]> {
    const assessments = await this.scopedAssessmentRepo.find({
      where: { enrollmentId },
      order: { createdAt: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:enrollmentId/assessments.
    assessments.forEach((a) => delete (a as { tenantId?: string | null }).tenantId);
    return assessments;
  }

  /** Cross-enrollment list — returns SUBMITTED + UNDER_REVIEW assessments for countersign queue */
  async findAwaitingReview(): Promise<EicAssessment[]> {
    const qb = await this.scopedAssessmentRepo.createQueryBuilder('a');
    const assessments = await qb
      .leftJoinAndSelect('a.enrollment', 'e')
      .leftJoinAndSelect('e.patient', 'p')
      .where('a.status IN (:...statuses)', {
        statuses: [EicAssessmentStatus.SUBMITTED, EicAssessmentStatus.UNDER_REVIEW],
      })
      .orderBy('a.submittedAt', 'ASC')
      .getMany();
    // A5.5 API Contract Audit: backs GET /eic/assessments -- eager
    // `enrollment`/`enrollment.patient` joins each carry their own
    // tenantId, so strip post-fetch at every level instead of an
    // impractical hand-crafted .select() list.
    for (const a of assessments) {
      delete (a as { tenantId?: string | null }).tenantId;
      if (a.enrollment) {
        delete (a.enrollment as { tenantId?: string | null }).tenantId;
        if (a.enrollment.patient) delete (a.enrollment.patient as { tenantId?: string | null }).tenantId;
      }
    }
    return assessments;
  }

  async findById(id: string): Promise<EicAssessment> {
    const assessment = await this.scopedAssessmentRepo.findOne({
      where: { id },
      relations: ['goals'],
    });
    if (!assessment) throw new NotFoundException(`Assessment ${id} not found`);
    // A5.5 API Contract Audit: backs GET /eic/assessments/:id -- eager
    // `goals` relation makes an explicit .select() column list impractical,
    // so strip tenantId post-fetch instead.
    delete (assessment as { tenantId?: string | null }).tenantId;
    for (const g of assessment.goals ?? []) delete (g as { tenantId?: string | null }).tenantId;
    return assessment;
  }

  async update(id: string, dto: UpdateAssessmentDto, actorId: string): Promise<EicAssessment> {
    const assessment = await this.findById(id);

    if (assessment.therapistId !== actorId) {
      throw new ForbiddenException(
        'Only the assigned therapist can edit this assessment.',
      );
    }

    if (assessment.status === EicAssessmentStatus.FINALISED) {
      throw new BadRequestException('Cannot modify a finalised assessment');
    }

    await this.assessmentRepo.update(id, dto as any);
    return this.findById(id);
  }

  async submit(id: string, actorId: string): Promise<EicAssessment> {
    const assessment = await this.findById(id);

    if (assessment.therapistId !== actorId) {
      throw new ForbiddenException(
        'Only the assigned therapist can submit this assessment.',
      );
    }

    const allowedFromStatuses = [EicAssessmentStatus.DRAFT, EicAssessmentStatus.REVISION_REQUESTED];
    if (!allowedFromStatuses.includes(assessment.status)) {
      throw new BadRequestException(`Assessment is in ${assessment.status} state, cannot submit`);
    }

    const isResubmission = assessment.status === EicAssessmentStatus.REVISION_REQUESTED;

    await this.assessmentRepo.update(id, {
      status:      EicAssessmentStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    await this.auditService.log({
      module:     'EIC',
      action:     isResubmission ? 'EIC_ASSESSMENT_RESUBMITTED' : 'EIC_ASSESSMENT_SUBMITTED',
      entityType: 'eic_assessments',
      entityId:   id,
      userId: actorId,
      metadata:   { discipline: assessment.discipline, isResubmission },
    });

    return this.findById(id);
  }

  async countersign(
    id: string,
    actorId: string,
    notes?: string,
  ): Promise<EicAssessment> {
    const assessment = await this.findById(id);

    if (
      assessment.status !== EicAssessmentStatus.SUBMITTED &&
      assessment.status !== EicAssessmentStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException('Assessment must be SUBMITTED or UNDER_REVIEW to countersign');
    }

    await this.assessmentRepo.update(id, {
      status:           EicAssessmentStatus.FINALISED,
      countersignedBy:  actorId,
      countersignedAt:  new Date(),
      countersignNotes: notes ?? null,
      finalisedAt:      new Date(),
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_ASSESSMENT_COUNTERSIGNED',
      entityType: 'eic_assessments',
      entityId:   id,
      userId: actorId,
      metadata:   { discipline: assessment.discipline },
    });

    return this.findById(id);
  }

  /**
   * Start a reassessment from a finalised therapy assessment.
   * Creates a new DRAFT assessment linked to the parent via parentAssessmentId.
   * The parent must be FINALISED — you cannot reassess a draft or submitted assessment.
   */
  async reassess(
    parentId: string,
    dto: { therapistId: string; therapistName: string },
    actorId: string,
  ): Promise<EicAssessment> {
    const parent = await this.findById(parentId);

    if (parent.status !== EicAssessmentStatus.FINALISED) {
      throw new BadRequestException(
        'Only a FINALISED assessment can be reassessed. Complete and countersign the current assessment first.',
      );
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const reassessment = this.assessmentRepo.create({
      enrollmentId:       parent.enrollmentId,
      discipline:         parent.discipline,
      therapistId:        dto.therapistId,
      therapistName:      dto.therapistName,
      assessmentType:     'REASSESSMENT',
      parentAssessmentId: parentId,
      status:             EicAssessmentStatus.DRAFT,
      tenantId,
    });

    const saved = await this.assessmentRepo.save(reassessment);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_ASSESSMENT_REASSESSMENT_STARTED',
      entityType: 'eic_assessments',
      entityId:   saved.id,
      userId:     actorId,
      metadata:   { parentId, enrollmentId: parent.enrollmentId, discipline: parent.discipline },
    });

    this.logger.log(`Reassessment ${saved.id} created from parent ${parentId}`);
    return saved;
  }

  async requestRevision(id: string, actorId: string, notes: string): Promise<EicAssessment> {
    const assessment = await this.findById(id);

    const allowedFromStatuses = [EicAssessmentStatus.SUBMITTED, EicAssessmentStatus.UNDER_REVIEW];
    if (!allowedFromStatuses.includes(assessment.status)) {
      throw new BadRequestException('Assessment must be SUBMITTED or UNDER_REVIEW to request revision');
    }

    await this.assessmentRepo.update(id, {
      status:           EicAssessmentStatus.REVISION_REQUESTED,
      countersignNotes: notes,
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_ASSESSMENT_REVISION_REQUESTED',
      entityType: 'eic_assessments',
      entityId:   id,
      userId:     actorId,
      metadata:   { discipline: assessment.discipline, notes },
    });

    return this.findById(id);
  }
}
