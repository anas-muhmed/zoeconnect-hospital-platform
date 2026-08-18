import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { EicProgressReport }            from '../entities/eic-progress-report.entity';
import { EicDisciplineProgressSection } from '../entities/eic-discipline-progress-section.entity';
import { EicAssessment }                from '../entities/eic-assessment.entity';
import { EicGoal }                      from '../entities/eic-goal.entity';
import { EicTherapySession }            from '../entities/eic-therapy-session.entity';
import { AuditService }                 from '../../audit/audit.service';
import { EicReportStatus, EicSectionStatus, EicGoalStatus } from '../common/enums/assessment-status.enum';
import { EicDiscipline }                from '../common/enums/discipline.enum';
import { EicDisciplineAssignmentService } from '../discipline-assignment/eic-discipline-assignment.service';
import { EicProgressReportPolicy, ReportEvent } from './eic-progress-report.policy';
import {
  REPORT_EVENTS,
  ReportCreatedEvent,
  SectionSubmittedEvent,
  ReportReadyForSignatureEvent,
  ReportSignedEvent,
} from './report.events';
import { User } from '../../users/entities/user.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EicProgressReportService {
  private readonly logger = new Logger(EicProgressReportService.name);

  constructor(
    @InjectRepository(EicProgressReport)
    private readonly reportRepo: Repository<EicProgressReport>,

    @InjectRepository(EicDisciplineProgressSection)
    private readonly sectionRepo: Repository<EicDisciplineProgressSection>,

    @InjectRepository(EicAssessment)
    private readonly assessmentRepo: Repository<EicAssessment>,

    @InjectRepository(EicGoal)
    private readonly goalRepo: Repository<EicGoal>,

    @InjectRepository(EicTherapySession)
    private readonly sessionRepo: Repository<EicTherapySession>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly assignmentSvc: EicDisciplineAssignmentService,
    private readonly policy:        EicProgressReportPolicy,
    private readonly events:        EventEmitter2,
    private readonly auditService:  AuditService,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findByEnrollment()`/
     * `findById()`/`findWorkQueue()` only. `initiate()`, `updateSection()`,
     * `submitSection()`, `sign()`, and `resolvePatientId()` (raw SQL) stay on
     * `reportRepo`/`sectionRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicProgressReport))
    private readonly scopedReportRepo: TenantScopedRepository<EicProgressReport>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Initiate ────────────────────────────────────────────────────────────────

  async initiate(
    enrollmentId: string,
    periodFrom:   string,
    periodTo:     string,
    disciplines:  EicDiscipline[],
    actorId:      string,
    options?: { sectionsDueDate?: string; reportDueDate?: string },
  ): Promise<EicProgressReport> {
    const existingCount = await this.reportRepo.count({ where: { enrollmentId } });
    const reportNumber  = existingCount + 1;
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const report = this.reportRepo.create({
      enrollmentId,
      reportNumber,
      periodFrom,
      periodTo,
      status:          EicReportStatus.IN_PROGRESS,
      initiatedBy:     actorId,
      sectionsDueDate: options?.sectionsDueDate ?? null,
      reportDueDate:   options?.reportDueDate   ?? null,
      tenantId,
    });
    const saved = await this.reportRepo.save(report);

    // Pre-populate ownership from active PRIMARY assignments, and build a snapshot
    // of the latest assessment and goals for the discipline.
    const reportDate = new Date(); // Use current date for the snapshot boundary

    await Promise.all(
      disciplines.map(async (discipline) => {
        const assignment = await this.assignmentSvc.findActivePrimary(enrollmentId, discipline);
        let therapistName = null;
        if (assignment?.therapistId) {
          const tUser = await this.userRepo.findOne({ where: { id: assignment.therapistId }, select: ['id', 'fullName', 'username'] });
          therapistName = tUser?.fullName ?? tUser?.username ?? null;
        }

        // 1. Fetch latest assessment for this discipline on or before today
        const latestAssessment = await this.assessmentRepo
          .createQueryBuilder('a')
          .where('a.enrollmentId = :enrollmentId', { enrollmentId })
          .andWhere('a.discipline = :discipline', { discipline })
          .andWhere('a.createdAt <= :reportDate', { reportDate })
          .orderBy('a.createdAt', 'DESC')
          .getOne();

        // 2. Fetch goals for this discipline up to today
        const goals = await this.goalRepo
          .createQueryBuilder('g')
          .where('g.enrollmentId = :enrollmentId', { enrollmentId })
          .andWhere('g.discipline = :discipline', { discipline })
          .andWhere('g.createdAt <= :reportDate', { reportDate })
          .getMany();

        const activeCount = goals.filter(g => g.status === EicGoalStatus.ACTIVE).length;
        const achievedCount = goals.filter(g => g.status === EicGoalStatus.ACHIEVED).length;
        const discontinuedCount = goals.filter(g => g.status === EicGoalStatus.DISCONTINUED).length;

        const sectionData = {
          assessmentSnapshot: latestAssessment ? {
            assessmentDate: latestAssessment.createdAt.toISOString().split('T')[0],
            clinicalObservations: latestAssessment.clinicalObservations,
            recommendations: latestAssessment.recommendations,
            therapist: latestAssessment.therapistName,
          } : null,
          goalSummary: {
            active: 0,
            achieved: 0,
            discontinued: 0,
          },
          goals: [], // Goals will be hydrated live during Draft
        };

        return this.sectionRepo.save(
          this.sectionRepo.create({
            progressReportId: saved.id,
            discipline,
            // Pre-populate therapistId from active PRIMARY assignment; null if unassigned
            therapistId: assignment?.therapistId ?? null,
            tenantId,
            therapistName: therapistName ?? latestAssessment?.therapistName ?? null,
            goalsInProgress: 0,
            goalsAchieved: 0,
            sessionsHeld: 0,
            sectionData,
          }),
        );
      }),
    );

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PROGRESS_REPORT_INITIATED',
      entityType: 'eic_progress_reports',
      entityId:   saved.id,
      userId:     actorId,
      metadata:   { enrollmentId, reportNumber, periodFrom, periodTo },
    });

    const fullReport = await this.findById(saved.id);
    const patientId  = await this.resolvePatientId(enrollmentId);

    this.events.emit(
      REPORT_EVENTS.CREATED,
      new ReportCreatedEvent(saved.id, enrollmentId, patientId, actorId, reportNumber),
    );

    return fullReport;
  }

  // ── Live Draft Hydration ────────────────────────────────────────────────────
  //
  // Query-plan note: hydration used to run entirely per-section (one
  // assessment lookup, one therapist lookup, one sessions query, one goals
  // query -- each scoped by `discipline` -- repeated for every section on
  // the report). Every one of those queries is scoped by the SAME
  // enrollmentId/period and only varies by discipline, and a report has a
  // small, known set of disciplines up front, so they're batched here into
  // one query per data source (sessions, goals, assessments, assignments,
  // users) covering all of a report's disciplines at once, then sliced back
  // out per section in memory. Output is identical to the old per-section
  // version -- this only changes how many round trips it takes to build it.
  private async hydrateLiveDrafts(report: EicProgressReport): Promise<EicProgressReport> {
    if (report.status === EicReportStatus.SIGNED || report.status === EicReportStatus.PUBLISHED) {
      return report;
    }

    const sections = (report.sections ?? []).filter(s => s.status !== EicSectionStatus.SUBMITTED);
    if (sections.length > 0) {
      await this.hydrateLiveSections(sections, report.enrollmentId, report.periodFrom, report.periodTo);
    }
    return report;
  }

  private async hydrateLiveSection(section: EicDisciplineProgressSection, enrollmentId: string, periodFrom: string, periodTo: string): Promise<void> {
    await this.hydrateLiveSections([section], enrollmentId, periodFrom, periodTo);
  }

  private async hydrateLiveSections(
    sections:     EicDisciplineProgressSection[],
    enrollmentId: string,
    periodFrom:   string,
    periodTo:     string,
  ): Promise<void> {
    const disciplines = [...new Set(sections.map(s => s.discipline))];

    // 1. Latest assessment per discipline (same "no date filter, just most
    //    recent" semantics as the old per-section query) -- one query, then
    //    keep only the first (most recent) row per discipline in memory.
    const assessments = await this.assessmentRepo
      .createQueryBuilder('a')
      .where('a.enrollmentId = :enrollmentId', { enrollmentId })
      .andWhere('a.discipline IN (:...disciplines)', { disciplines })
      .orderBy('a.createdAt', 'DESC')
      .getMany();
    const latestAssessmentByDiscipline = new Map<string, EicAssessment>();
    for (const a of assessments) {
      if (!latestAssessmentByDiscipline.has(a.discipline)) latestAssessmentByDiscipline.set(a.discipline, a);
    }

    // 2. Sessions in-period across every discipline on the report — one query.
    const allSessions = disciplines.length > 0
      ? await this.sessionRepo
          .createQueryBuilder('s')
          .where('s.enrollmentId = :enrollmentId', { enrollmentId })
          .andWhere('s.discipline IN (:...disciplines)', { disciplines })
          .andWhere('s.sessionDate >= :periodFrom', { periodFrom })
          .andWhere('s.sessionDate <= :periodTo', { periodTo })
          .getMany()
      : [];
    const sessionsByDiscipline = new Map<string, EicTherapySession[]>();
    for (const s of allSessions) {
      const arr = sessionsByDiscipline.get(s.discipline) ?? [];
      arr.push(s);
      sessionsByDiscipline.set(s.discipline, arr);
    }

    // 3. Goals up to periodTo across every discipline — one query.
    const allGoals = disciplines.length > 0
      ? await this.goalRepo
          .createQueryBuilder('g')
          .where('g.enrollmentId = :enrollmentId', { enrollmentId })
          .andWhere('g.discipline IN (:...disciplines)', { disciplines })
          .andWhere('g.createdAt <= :periodTo', { periodTo })
          .getMany()
      : [];
    const goalsByDiscipline = new Map<string, EicGoal[]>();
    for (const g of allGoals) {
      const arr = goalsByDiscipline.get(g.discipline) ?? [];
      arr.push(g);
      goalsByDiscipline.set(g.discipline, arr);
    }

    // 4. Active PRIMARY assignment per discipline (fallback therapist source,
    //    only reached when neither the assessment snapshot nor the latest
    //    assessment itself carries a therapist name) — one query.
    const needsAssignment = sections.filter(s => {
      if (s.therapistName) return false;
      if ((s.sectionData as any)?.assessmentSnapshot?.therapist) return false;
      if (latestAssessmentByDiscipline.get(s.discipline)?.therapistName) return false;
      return true;
    });
    const assignmentByDiscipline = await this.assignmentSvc.findActivePrimaryBatch(
      enrollmentId,
      needsAssignment.map(s => s.discipline),
    );

    // 5. Users for whichever assignments actually resolved to a therapist — one query.
    const therapistIds = [...new Set(
      [...assignmentByDiscipline.values()].map(a => a.therapistId).filter((id): id is string => !!id),
    )];
    const usersById = new Map<string, User>();
    if (therapistIds.length > 0) {
      const users = await this.userRepo.find({ where: { id: In(therapistIds) }, select: ['id', 'fullName', 'username'] });
      for (const u of users) usersById.set(u.id, u);
    }

    for (const section of sections) {
      section.sectionData = section.sectionData || {};
      const latest = latestAssessmentByDiscipline.get(section.discipline);

      // 0a. Hydrate Assessment Snapshot if completely missing
      if (!(section.sectionData as any).assessmentSnapshot && latest) {
        (section.sectionData as any).assessmentSnapshot = {
          assessmentDate: latest.createdAt.toISOString().split('T')[0],
          clinicalObservations: latest.clinicalObservations,
          recommendations: latest.recommendations,
          therapist: latest.therapistName,
        };
      }

      // 0b. Fallback for therapist name if missing
      if (!section.therapistName) {
        let name = (section.sectionData as any)?.assessmentSnapshot?.therapist;

        if (!name) {
          name = latest?.therapistName;
        }

        if (!name) {
          const assignment = assignmentByDiscipline.get(section.discipline);
          if (assignment?.therapistId) {
            const tUser = usersById.get(assignment.therapistId);
            name = tUser?.fullName ?? tUser?.username;
          }
        }

        section.therapistName = name ?? null;
      }

      // 1. Calculate live sessions
      const sessions = sessionsByDiscipline.get(section.discipline) ?? [];
      const attended = sessions.filter(s => s.attendance === 'PRESENT').length;
      const absent = sessions.filter(s => s.attendance === 'ABSENT').length;
      const cancelled = sessions.filter(s => s.attendance === 'CANCELLED').length;
      const planned = attended + absent; // Not counting cancelled towards planned in some clinics, but let's just sum it
      const attendancePercent = planned > 0 ? Math.round((attended / planned) * 100) : 0;

      section.sessionsHeld = attended;
      section.sectionData = section.sectionData || {};
      section.sectionData.treatmentSummary = {
        planned: planned + cancelled,
        attended,
        absent,
        cancelled,
        attendancePercent,
      };

      // 2. Live goals up to report periodTo
      const liveGoals = goalsByDiscipline.get(section.discipline) ?? [];
      const activeCount = liveGoals.filter(g => g.status === EicGoalStatus.ACTIVE).length;
      const achievedCount = liveGoals.filter(g => g.status === EicGoalStatus.ACHIEVED).length;
      const discontinuedCount = liveGoals.filter(g => g.status === EicGoalStatus.DISCONTINUED).length;

      section.goalsInProgress = activeCount;
      section.goalsAchieved = achievedCount;

      const existingGoalNotes = new Map<string, { progressNote: string, outcomeNote: string }>(
        ((section.sectionData.goals as any[]) || []).map((g: any) => [g.goalId, { progressNote: g.progressNote || '', outcomeNote: g.outcomeNote || '' }])
      );

      section.sectionData.goalSummary = {
        active: activeCount,
        achieved: achievedCount,
        discontinued: discontinuedCount,
      };

      section.sectionData.goals = liveGoals.map(g => {
        const saved = existingGoalNotes.get(g.id);
        return {
          goalId: g.id,
          description: g.goalText,
          status: g.status, // live status!
          progressNote: saved?.progressNote || '',
          outcomeNote: saved?.outcomeNote || '',
        };
      });
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async findByEnrollment(enrollmentId: string): Promise<EicProgressReport[]> {
    const reports = await this.scopedReportRepo.find({
      where: { enrollmentId },
      relations: ['sections'],
      order: { reportNumber: 'DESC' },
    });
    // Reconciliation note (ZoeConnect vs. hybrid merge): the hybrid side of this
    // conflict had dropped the hydrateLiveDrafts() call entirely -- restored
    // it here, ahead of the tenantId-stripping below, so in-progress reports
    // still get their live session/goal data computed on every read (same
    // as ZoeConnect's original behavior), while keeping hybrid's tenant-scoped
    // fetch and its own A5.5 API-contract stripping.
    const hydrated = await Promise.all(reports.map(r => this.hydrateLiveDrafts(r)));
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:enrollmentId/progress-reports
    // -- eager `sections` relation (also carrying its own tenantId) makes
    // an explicit .select() column list impractical, so strip post-fetch.
    for (const r of hydrated) {
      delete (r as { tenantId?: string | null }).tenantId;
      for (const s of r.sections ?? []) delete (s as { tenantId?: string | null }).tenantId;
    }
    return hydrated;
  }

  async findById(id: string): Promise<EicProgressReport> {
    const report = await this.scopedReportRepo.findOne({
      where: { id },
      relations: ['sections'],
    });
    if (!report) throw new NotFoundException(`Progress report ${id} not found`);
    // Reconciliation note: same fix as findByEnrollment() above -- hydrate
    // live draft data before stripping tenantId for the API contract.
    const hydrated = await this.hydrateLiveDrafts(report);
    delete (hydrated as { tenantId?: string | null }).tenantId;
    for (const s of hydrated.sections ?? []) delete (s as { tenantId?: string | null }).tenantId;
    return hydrated;
  }

  // ── Update Section ──────────────────────────────────────────────────────────

  async updateSection(
    reportId:   string,
    discipline: EicDiscipline,
    data:       Partial<EicDisciplineProgressSection>,
    actorId:    string,
  ): Promise<EicDisciplineProgressSection> {
    const section = await this.sectionRepo.findOne({
      where: { progressReportId: reportId, discipline },
    });
    if (!section) throw new NotFoundException(`Section ${discipline} not found for report`);

    if (section.status === EicSectionStatus.SUBMITTED) {
      throw new BadRequestException('Section already submitted');
    }

    await this.sectionRepo.update(section.id, data as any);
    return this.sectionRepo.findOneOrFail({ where: { id: section.id } });
  }

  // ── Submit Section ──────────────────────────────────────────────────────────

  async submitSection(
    reportId:   string,
    discipline: EicDiscipline,
    actorId:    string,
  ): Promise<EicProgressReport> {
    const section = await this.sectionRepo.findOne({
      where: { progressReportId: reportId, discipline },
    });
    if (!section) throw new NotFoundException(`Section ${discipline} not found for report`);

    if (section.status === EicSectionStatus.SUBMITTED) {
      throw new BadRequestException('Section already submitted');
    }

    // Snapshot the submitter's name at the moment of submission (point-in-time attestation)
    const actor           = await this.userRepo.findOne({ where: { id: actorId }, select: ['id', 'fullName', 'username'] });
    const submittedByName = actor?.fullName ?? actor?.username ?? actorId;

    // Freeze the live data into the DB right before marking as SUBMITTED
    const reportContext = await this.reportRepo.findOne({ where: { id: reportId } });
    if (reportContext) {
      await this.hydrateLiveSection(section, reportContext.enrollmentId, reportContext.periodFrom, reportContext.periodTo);
    }

    await this.sectionRepo.update(section.id, {
      status:          EicSectionStatus.SUBMITTED,
      submittedAt:     new Date(),
      submittedByName,
      sessionsHeld:    section.sessionsHeld,
      goalsAchieved:   section.goalsAchieved,
      goalsInProgress: section.goalsInProgress,
      sectionData:     section.sectionData as any,
      // therapistId is NOT overwritten here — it was pre-populated at initiation
    });

    const report    = await this.findById(reportId);
    const patientId = await this.resolvePatientId(report.enrollmentId);
    const pending   = report.sections.filter((s) => s.status !== EicSectionStatus.SUBMITTED);

    this.events.emit(
      REPORT_EVENTS.SECTION_SUBMITTED,
      new SectionSubmittedEvent(reportId, report.enrollmentId, patientId, actorId, discipline),
    );

    // Transition report to PENDING_SIGNATURE when all sections submitted
    if (pending.length === 0) {
      if (!this.policy.canTransition(report.status, ReportEvent.ALL_SECTIONS_SUBMITTED)) {
        this.logger.warn(
          `All sections submitted but policy blocks transition: ` +
          this.policy.guardMessage(report.status, ReportEvent.ALL_SECTIONS_SUBMITTED),
        );
      } else {
        const nextStatus = this.policy.nextState(report.status, ReportEvent.ALL_SECTIONS_SUBMITTED);
        await this.reportRepo.update(reportId, { status: nextStatus });

        this.events.emit(
          REPORT_EVENTS.READY_FOR_SIGNATURE,
          new ReportReadyForSignatureEvent(reportId, report.enrollmentId, patientId, actorId),
        );
      }
    }

    return this.findById(reportId);
  }

  // ── Sign ────────────────────────────────────────────────────────────────────

  async sign(
    reportId:             string,
    actorId:              string,
    signatoryName:        string,
    signatoryDesignation: string,
  ): Promise<EicProgressReport> {
    const report = await this.findById(reportId);

    if (!this.policy.canTransition(report.status, ReportEvent.SIGN)) {
      throw new BadRequestException(this.policy.guardMessage(report.status, ReportEvent.SIGN));
    }

    const nextStatus = this.policy.nextState(report.status, ReportEvent.SIGN);

    await this.reportRepo.update(reportId, {
      status: nextStatus,
      signedBy:             actorId,
      signedAt:             new Date(),
      signatoryName,
      signatoryDesignation,
    });

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_PROGRESS_REPORT_SIGNED',
      entityType: 'eic_progress_reports',
      entityId:   reportId,
      userId:     actorId,
      metadata:   { reportNumber: report.reportNumber, signatoryName },
    });

    const patientId = await this.resolvePatientId(report.enrollmentId);
    this.events.emit(
      REPORT_EVENTS.SIGNED,
      new ReportSignedEvent(reportId, report.enrollmentId, patientId, actorId, signatoryName),
    );

    return this.findById(reportId);
  }

  // ── Work Queue (cross-enrollment) ───────────────────────────────────────────

  /**
   * Cross-enrollment work queue query.
   *
   * view = 'MY_SECTIONS'        — reports that have at least one section assigned to actorId
   *                               and are not yet SIGNED (Therapist inbox)
   * view = 'PENDING_SIGNATURE'  — all reports in PENDING_SIGNATURE status (Centre Head queue)
   * view = 'ALL'                — every report in the system (Admin / global management)
   *
   * Returns a flat list enriched with patient name, MRN, and enrollment number
   * so the frontend does not need secondary calls.
   */
  async findWorkQueue(
    view:    'MY_SECTIONS' | 'PENDING_SIGNATURE' | 'ALL',
    actorId: string,
    limit    = 100,
    offset   = 0,
  ): Promise<WorkQueueItem[]> {
    const qb = (await this.scopedReportRepo.createQueryBuilder('r'))
      .innerJoin('eic_therapy_enrollments', 'e',  'e.id = r.enrollment_id')
      .innerJoin('eic_patients',            'p',  'p.id = e.patient_id')
      .leftJoin(
        'eic_discipline_progress_sections', 's', 's.progress_report_id = r.id',
      )
      .select([
        'r.id                   AS "id"',
        'r.report_number        AS "reportNumber"',
        'r.period_from          AS "periodFrom"',
        'r.period_to            AS "periodTo"',
        'r.status               AS "status"',
        'r.sections_due_date    AS "sectionsDueDate"',
        'r.report_due_date      AS "reportDueDate"',
        'r.created_at           AS "createdAt"',
        'e.id                   AS "enrollmentId"',
        'e.enrollment_number    AS "enrollmentNumber"',
        'p.id                   AS "patientId"',
        'p.full_name            AS "patientName"',
        'p.mrn                  AS "patientMrn"',
        // Aggregate sections as JSON array
        `json_agg(json_build_object(
           'discipline',  s.discipline,
           'status',      s.status,
           'therapistId', s.therapist_id
         ) ORDER BY s.discipline) AS "sections"`,
      ])
      .groupBy('r.id, e.id, p.id');

    if (view === 'MY_SECTIONS') {
      // Reports that have at least one section belonging to this therapist
      // and are not yet closed (not SIGNED)
      qb.where(
        `r.id IN (
          SELECT progress_report_id FROM eic_discipline_progress_sections
          WHERE therapist_id = :actorId
        )`,
        { actorId },
      ).andWhere('r.status != :signed', { signed: EicReportStatus.SIGNED });
    } else if (view === 'PENDING_SIGNATURE') {
      qb.where('r.status = :status', { status: EicReportStatus.PENDING_SIGNATURE });
    }
    // view = 'ALL': no additional filter

    qb.orderBy('r.created_at', 'DESC').limit(limit).offset(offset);

    const rows = await qb.getRawMany();

    return rows.map((row) => ({
      id:               row.id,
      reportNumber:     row.reportNumber,
      periodFrom:       row.periodFrom,
      periodTo:         row.periodTo,
      status:           row.status as EicReportStatus,
      sectionsDueDate:  row.sectionsDueDate ?? null,
      reportDueDate:    row.reportDueDate   ?? null,
      createdAt:        row.createdAt,
      enrollmentId:     row.enrollmentId,
      enrollmentNumber: row.enrollmentNumber,
      patientId:        row.patientId,
      patientName:      row.patientName,
      patientMrn:       row.patientMrn,
      // Filter out null rows when report has no sections yet
      sections: (row.sections ?? []).filter((s: any) => s.discipline !== null),
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve patientId from an enrollmentId for event payloads.
   * Uses a raw query to avoid loading the full enrollment entity.
   */
  private async resolvePatientId(enrollmentId: string): Promise<string> {
    const rows = await this.reportRepo.manager.query(
      'SELECT patient_id FROM eic_therapy_enrollments WHERE id = $1 LIMIT 1',
      [enrollmentId],
    );
    return rows?.[0]?.patient_id ?? '';
  }
}

// ── Work Queue Response Type ─────────────────────────────────────────────────

export interface WorkQueueItem {
  id:               string;
  reportNumber:     number;
  periodFrom:       string;
  periodTo:         string;
  status:           EicReportStatus;
  sectionsDueDate:  string | null;
  reportDueDate:    string | null;
  createdAt:        string;
  enrollmentId:     string;
  enrollmentNumber: string;
  patientId:        string;
  patientName:      string;
  patientMrn:       string;
  sections: Array<{
    discipline:  string;
    status:      string;
    therapistId: string | null;
  }>;
}
