import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvTimetable, CvTimetableChangeType, CvTimetableStatus } from './entities/cv-timetable.entity';
import { CvTimetablePeriod } from './entities/cv-timetable-period.entity';
import { CvTimetableWorkflowService } from './cv-timetable-workflow.service';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/**
 * Local calendar-day string ('YYYY-MM-DD') -- deliberately NOT
 * toISOString(), which is UTC and can land on the wrong day depending on
 * server timezone. Deliberately duplicated (not imported) from
 * `cv-timetable.service.ts`'s identical private helper: that file is the
 * one already relied on by the live teacher-workspace flow, and exporting
 * from it just to share four lines wasn't worth touching a file this
 * phase doesn't otherwise need to change.
 */
function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayParam(): string {
  return toDateParam(new Date());
}

export interface CvTimetablePeriodDiffEntry {
  kind: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';
  before: Partial<CvTimetablePeriod> | null;
  after: Partial<CvTimetablePeriod> | null;
}

export interface CvTimetableVersionComparison {
  fromVersion: { id: string; version: number; status: CvTimetableStatus };
  toVersion: { id: string; version: number; status: CvTimetableStatus };
  periodDiffs: CvTimetablePeriodDiffEntry[];
}

const PERIOD_COMPARE_FIELDS: Array<keyof CvTimetablePeriod> = [
  'dayOfWeek', 'startTime', 'endTime', 'subjectId', 'teacherId', 'room', 'resourceId', 'notes', 'periodNumber',
];

/**
 * Timetable Management Phase 2 -- version lifecycle, cloning, rollback,
 * and comparison. Deliberately a SEPARATE service from the existing
 * `CvTimetableService`, not new methods bolted onto it: that service is
 * already relied on by the live teacher-workspace flow
 * (`getTeacherScheduleForDate`, `updatePeriod`, etc.), and this phase's
 * version-level state machine is a different concern (whole-timetable
 * lifecycle vs. day-to-day period edits) that doesn't need to share a
 * class to share a subsystem. Nothing in `CvTimetableService` is read,
 * written, or otherwise touched by this file.
 *
 * Per the phase scope: NO approval integration here. `publish()` moves a
 * DRAFT/IN_REVIEW version straight to PUBLISHED (and immediately to
 * ACTIVE if its effective date has arrived) with no PENDING_APPROVAL/
 * APPROVED gate -- Phase 6 will insert that gate by calling into the
 * existing `document-platform/workflow-engine` before allowing this
 * transition, once `cv_timetable_approval_config` (Phase 1) is actually
 * consulted. Until then, publishing is unconditional for anyone holding
 * `CV:TIMETABLE:PUBLISH`.
 *
 * The Phase 1 report flagged that no DB-level "only one ACTIVE version
 * per class+year+term" constraint was added (deferred pending a
 * production data audit). This service enforces that invariant in
 * application code instead, inside a transaction, whenever a version
 * transitions to ACTIVE.
 */
@Injectable()
export class CvTimetableLifecycleService {
  constructor(
    @InjectRepository(CvTimetable)
    private readonly writeRepo: Repository<CvTimetable>,

    @Inject(getTenantScopedRepositoryToken(CvTimetable))
    private readonly readRepo: TenantScopedRepository<CvTimetable>,

    @Inject(getTenantScopedRepositoryToken(CvTimetablePeriod))
    private readonly periodReadRepo: TenantScopedRepository<CvTimetablePeriod>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
    private readonly workflowService: CvTimetableWorkflowService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<CvTimetable> {
    const timetable = await this.readRepo.findOne({ where: { id } });
    if (!timetable) throw new NotFoundException(`Timetable ${id} not found`);
    return timetable;
  }

  async listVersions(classId: string, academicYearId: string, termId?: string | null): Promise<CvTimetable[]> {
    return this.readRepo.find({
      where: termId ? { classId, academicYearId, termId } : { classId, academicYearId },
      order: { version: 'DESC' },
    });
  }

  async getActiveVersion(classId: string, academicYearId: string, termId?: string | null): Promise<CvTimetable | null> {
    return this.readRepo.findOne({
      where: termId
        ? { classId, academicYearId, termId, status: 'ACTIVE' }
        : { classId, academicYearId, status: 'ACTIVE' },
    });
  }

  /** Raw period listing for one version -- used by the controller to render a version's contents, and internally by compareVersions(). */
  async listPeriods(timetableId: string): Promise<CvTimetablePeriod[]> {
    return this.periodReadRepo.find({
      where: { timetableId },
      relations: ['subject'],
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  // ── Lifecycle transitions ─────────────────────────────────────────

  private assertTransition(current: CvTimetableStatus, allowed: CvTimetableStatus[], action: string) {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `Cannot ${action}: timetable is '${current}', expected one of [${allowed.join(', ')}]`,
      );
    }
  }

  async submitForReview(actorId: string, timetableId: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['DRAFT'], 'submit for review');

    timetable.status = 'IN_REVIEW';
    timetable.updatedBy = actorId;
    const saved = await this.writeRepo.save(timetable);

    await this.logTransition(actorId, saved, 'CV_TIMETABLE_SUBMITTED_FOR_REVIEW');
    return saved;
  }

  async returnToDraft(actorId: string, timetableId: string, reason?: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['IN_REVIEW', 'REJECTED'], 'return to draft');

    timetable.status = 'DRAFT';
    timetable.updatedBy = actorId;
    const saved = await this.writeRepo.save(timetable);

    await this.logTransition(actorId, saved, 'CV_TIMETABLE_RETURNED_TO_DRAFT', { reason });
    return saved;
  }

  /**
   * DRAFT/IN_REVIEW -> PUBLISHED, and immediately -> ACTIVE if
   * `effectiveFrom` is today or in the past (or omitted, which means
   * "effective immediately") -- UNLESS `cv_timetable_approval_config` has
   * approval configured (and not `DISABLED`) for this timetable's
   * `changeType` (Phase 6), in which case this instead moves the
   * timetable to `PENDING_APPROVAL` and creates a workflow instance;
   * actual publication happens later via `markApprovalOutcome()`, called
   * by `CvTimetableApprovalCompletionListener` once the approval chain
   * completes. For any tenant with no approval configured for this change
   * type, `CvTimetableWorkflowService.startApproval()` returns `{required:
   * false}` and this behaves exactly as it did before Phase 6 -- zero
   * regression by default.
   */
  async publish(actorId: string, timetableId: string, effectiveFrom?: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['DRAFT', 'IN_REVIEW'], 'publish');

    const resolvedEffectiveFrom = effectiveFrom ?? todayParam();
    if (timetable.effectiveTo && resolvedEffectiveFrom > timetable.effectiveTo) {
      throw new BadRequestException('effectiveFrom cannot be after effectiveTo');
    }

    const approval = await this.workflowService.startApproval(
      actorId,
      'TIMETABLE_PUBLISH',
      timetable.id,
      timetable.changeType ?? 'ROUTINE',
      timetable.classId,
    );

    if (approval.required) {
      timetable.status = 'PENDING_APPROVAL';
      timetable.effectiveFrom = resolvedEffectiveFrom;
      timetable.updatedBy = actorId;
      const saved = await this.writeRepo.save(timetable);
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_PENDING_APPROVAL', { workflowInstanceId: approval.instanceId });
      return saved;
    }

    return this.activateOrSchedule(timetable, actorId, resolvedEffectiveFrom);
  }

  /**
   * Called by `CvTimetableApprovalCompletionListener` once a Phase 6
   * approval instance started by `publish()` reaches a terminal outcome.
   * APPROVED completes the publish that was deferred; REJECTED moves the
   * timetable to the distinct `REJECTED` state (per the design spec's
   * "terminal-per-attempt, not a silent return to Draft" requirement) --
   * from there, a caller must explicitly call `returnToDraft()` to start
   * a new edit cycle.
   */
  async markApprovalOutcome(actorId: string, timetableId: string, outcome: 'APPROVED' | 'REJECTED'): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['PENDING_APPROVAL'], 'apply approval outcome');

    if (outcome === 'REJECTED') {
      timetable.status = 'REJECTED';
      timetable.updatedBy = actorId;
      const saved = await this.writeRepo.save(timetable);
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_REJECTED');
      return saved;
    }

    const resolvedEffectiveFrom = timetable.effectiveFrom ?? todayParam();
    return this.activateOrSchedule(timetable, actorId, resolvedEffectiveFrom, true);
  }

  /**
   * Shared by `publish()` (when no approval is required) and
   * `markApprovalOutcome()` (when approval completes with APPROVED) --
   * the actual PUBLISHED/ACTIVE transition plus supersede-the-prior-active
   * logic, unchanged from Phase 2 except for being extracted into its own
   * method so Phase 6 could reuse it from two call sites.
   */
  private async activateOrSchedule(
    timetable: CvTimetable,
    actorId: string,
    resolvedEffectiveFrom: string,
    viaApproval = false,
  ): Promise<CvTimetable> {
    const shouldActivateNow = resolvedEffectiveFrom <= todayParam();

    const saved = await this.writeRepo.manager.transaction(async (manager) => {
      const txTimetableRepo = manager.getRepository(CvTimetable);

      timetable.status = shouldActivateNow ? 'ACTIVE' : 'PUBLISHED';
      timetable.effectiveFrom = resolvedEffectiveFrom;
      timetable.publishedAt = new Date();
      timetable.publishedBy = actorId;
      timetable.updatedBy = actorId;

      if (shouldActivateNow) {
        const currentActive = await txTimetableRepo.findOne({
          where: timetable.termId
            ? { classId: timetable.classId, academicYearId: timetable.academicYearId, termId: timetable.termId, status: 'ACTIVE' }
            : { classId: timetable.classId, academicYearId: timetable.academicYearId, status: 'ACTIVE' },
        });
        if (currentActive && currentActive.id !== timetable.id) {
          currentActive.status = 'SUPERSEDED';
          currentActive.supersededById = timetable.id;
          currentActive.updatedBy = actorId;
          await txTimetableRepo.save(currentActive);
          await this.auditService.log({
            module: 'CHILDRENS_VILLAGE',
            action: 'CV_TIMETABLE_SUPERSEDED',
            entityType: 'cv_timetables',
            entityId: currentActive.id,
            userId: actorId,
            metadata: { supersededById: timetable.id },
          });
        }
      }

      return txTimetableRepo.save(timetable);
    });

    await this.logTransition(actorId, saved, shouldActivateNow ? 'CV_TIMETABLE_PUBLISHED_AND_ACTIVATED' : 'CV_TIMETABLE_PUBLISHED', {
      effectiveFrom: resolvedEffectiveFrom,
      viaApproval,
    });
    return saved;
  }

  /**
   * Activates a PUBLISHED version whose effective date has now arrived.
   * Phase 2 has no scheduler/cron infrastructure addition -- this is a
   * manually/externally triggerable method (e.g. an ops script or a
   * future scheduled job) rather than a background timer, so it doesn't
   * introduce new always-on infrastructure this phase wasn't scoped for.
   */
  async activateIfEffective(actorId: string, timetableId: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['PUBLISHED'], 'activate');

    if (!timetable.effectiveFrom || timetable.effectiveFrom > todayParam()) {
      throw new BadRequestException('Effective date has not arrived yet');
    }

    return this.writeRepo.manager.transaction(async (manager) => {
      const txTimetableRepo = manager.getRepository(CvTimetable);
      const currentActive = await txTimetableRepo.findOne({
        where: timetable.termId
          ? { classId: timetable.classId, academicYearId: timetable.academicYearId, termId: timetable.termId, status: 'ACTIVE' }
          : { classId: timetable.classId, academicYearId: timetable.academicYearId, status: 'ACTIVE' },
      });
      if (currentActive && currentActive.id !== timetable.id) {
        currentActive.status = 'SUPERSEDED';
        currentActive.supersededById = timetable.id;
        currentActive.updatedBy = actorId;
        await txTimetableRepo.save(currentActive);
      }
      timetable.status = 'ACTIVE';
      timetable.updatedBy = actorId;
      return txTimetableRepo.save(timetable);
    }).then(async (saved) => {
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_ACTIVATED');
      return saved;
    });
  }

  async archive(actorId: string, timetableId: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['ACTIVE', 'SUPERSEDED', 'SUSPENDED'], 'archive');

    timetable.status = 'ARCHIVED';
    timetable.updatedBy = actorId;
    const saved = await this.writeRepo.save(timetable);

    await this.logTransition(actorId, saved, 'CV_TIMETABLE_ARCHIVED');
    return saved;
  }

  async suspend(actorId: string, timetableId: string, reason?: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['ACTIVE'], 'suspend');

    timetable.status = 'SUSPENDED';
    timetable.updatedBy = actorId;
    const saved = await this.writeRepo.save(timetable);

    await this.logTransition(actorId, saved, 'CV_TIMETABLE_SUSPENDED', { reason });
    return saved;
  }

  async resume(actorId: string, timetableId: string): Promise<CvTimetable> {
    const timetable = await this.findByIdOrThrow(timetableId);
    this.assertTransition(timetable.status, ['SUSPENDED'], 'resume');

    timetable.status = 'ACTIVE';
    timetable.updatedBy = actorId;
    const saved = await this.writeRepo.save(timetable);

    await this.logTransition(actorId, saved, 'CV_TIMETABLE_RESUMED');
    return saved;
  }

  // ── Versioning: clone / rollback / compare ─────────────────────────

  /**
   * Deep-clones `sourceTimetableId` (any status) into a brand new DRAFT
   * version -- `version` incremented, `parentVersionId` pointing at the
   * source, all periods copied with fresh ids. The source row itself is
   * never mutated, preserving immutability for PUBLISHED/ACTIVE/
   * SUPERSEDED/ARCHIVED versions per the design spec's versioning
   * requirement. Also usable to branch off a DRAFT (e.g. "start over from
   * this draft without losing it"), though the common case is cloning a
   * non-draft version in order to edit it.
   */
  async cloneForEdit(
    actorId: string,
    sourceTimetableId: string,
    changeType: CvTimetableChangeType = 'ROUTINE',
  ): Promise<CvTimetable> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const source = await this.findByIdOrThrow(sourceTimetableId);
    const sourcePeriods = await this.periodReadRepo.find({ where: { timetableId: source.id } });

    const latestVersion = await this.readRepo.find({
      where: source.termId
        ? { classId: source.classId, academicYearId: source.academicYearId, termId: source.termId }
        : { classId: source.classId, academicYearId: source.academicYearId },
      order: { version: 'DESC' },
    });
    const nextVersion = (latestVersion[0]?.version ?? source.version) + 1;

    return this.writeRepo.manager.transaction(async (manager) => {
      const txTimetableRepo = manager.getRepository(CvTimetable);
      const txPeriodRepo = manager.getRepository(CvTimetablePeriod);

      const draft = txTimetableRepo.create({
        tenantId,
        hospitalId: source.hospitalId,
        classId: source.classId,
        academicYearId: source.academicYearId,
        termId: source.termId,
        isActive: false,
        version: nextVersion,
        status: 'DRAFT',
        parentVersionId: source.id,
        changeType,
        createdBy: actorId,
        updatedBy: actorId,
      });
      const savedDraft = await txTimetableRepo.save(draft);

      if (sourcePeriods.length > 0) {
        const clonedPeriods = sourcePeriods.map((p) =>
          txPeriodRepo.create({
            tenantId,
            hospitalId: p.hospitalId,
            timetableId: savedDraft.id,
            dayOfWeek: p.dayOfWeek,
            startTime: p.startTime,
            endTime: p.endTime,
            subjectId: p.subjectId,
            teacherId: p.teacherId,
            room: p.room,
            resourceId: p.resourceId,
            notes: p.notes,
            periodNumber: p.periodNumber,
          }),
        );
        await txPeriodRepo.save(clonedPeriods);
      }

      return savedDraft;
    }).then(async (savedDraft) => {
      await this.logTransition(actorId, savedDraft, 'CV_TIMETABLE_VERSION_CLONED', {
        sourceTimetableId: source.id,
        sourceVersion: source.version,
        periodCount: sourcePeriods.length,
      });
      return savedDraft;
    });
  }

  /**
   * Rollback = clone a historical (SUPERSEDED/ARCHIVED) version into a
   * fresh DRAFT, ready to go through submit-for-review/publish again. The
   * historical version is never mutated or un-superseded in place --
   * "rollback" produces a new version, it doesn't rewrite history.
   */
  async rollback(actorId: string, historicalTimetableId: string): Promise<CvTimetable> {
    const historical = await this.findByIdOrThrow(historicalTimetableId);
    this.assertTransition(historical.status, ['SUPERSEDED', 'ARCHIVED'], 'rollback');

    const draft = await this.cloneForEdit(actorId, historicalTimetableId, 'EMERGENCY');

    await this.logTransition(actorId, draft, 'CV_TIMETABLE_ROLLBACK_INITIATED', {
      rolledBackFromId: historical.id,
      rolledBackFromVersion: historical.version,
    });

    return draft;
  }

  /**
   * Field-level diff of two versions' periods for the same class. Periods
   * are matched by (dayOfWeek, startTime, subjectId) as a best-effort key
   * -- there's no stable cross-version period identity today (each clone
   * gets fresh ids), so structural matching is the only option without a
   * lineage column this phase doesn't add.
   */
  async compareVersions(fromTimetableId: string, toTimetableId: string): Promise<CvTimetableVersionComparison> {
    const [fromTimetable, toTimetable] = await Promise.all([
      this.findByIdOrThrow(fromTimetableId),
      this.findByIdOrThrow(toTimetableId),
    ]);

    const [fromPeriods, toPeriods] = await Promise.all([
      this.periodReadRepo.find({ where: { timetableId: fromTimetableId } }),
      this.periodReadRepo.find({ where: { timetableId: toTimetableId } }),
    ]);

    const keyOf = (p: CvTimetablePeriod) => `${p.dayOfWeek}::${p.startTime}::${p.subjectId}`;
    const fromByKey = new Map(fromPeriods.map((p) => [keyOf(p), p]));
    const toByKey = new Map(toPeriods.map((p) => [keyOf(p), p]));

    const diffs: CvTimetablePeriodDiffEntry[] = [];
    const allKeys = new Set([...fromByKey.keys(), ...toByKey.keys()]);

    for (const key of allKeys) {
      const before = fromByKey.get(key) ?? null;
      const after = toByKey.get(key) ?? null;

      if (before && !after) {
        diffs.push({ kind: 'REMOVED', before: this.pickCompareFields(before), after: null });
        continue;
      }
      if (!before && after) {
        diffs.push({ kind: 'ADDED', before: null, after: this.pickCompareFields(after) });
        continue;
      }
      if (before && after) {
        const changed = PERIOD_COMPARE_FIELDS.some((field) => before[field] !== after[field]);
        diffs.push({
          kind: changed ? 'CHANGED' : 'UNCHANGED',
          before: this.pickCompareFields(before),
          after: this.pickCompareFields(after),
        });
      }
    }

    return {
      fromVersion: { id: fromTimetable.id, version: fromTimetable.version, status: fromTimetable.status },
      toVersion: { id: toTimetable.id, version: toTimetable.version, status: toTimetable.status },
      periodDiffs: diffs,
    };
  }

  private pickCompareFields(p: CvTimetablePeriod): Partial<CvTimetablePeriod> {
    const picked: Partial<CvTimetablePeriod> = {};
    for (const field of PERIOD_COMPARE_FIELDS) {
      (picked as Record<string, unknown>)[field] = p[field];
    }
    return picked;
  }

  private async logTransition(
    actorId: string,
    timetable: CvTimetable,
    action: string,
    extraMetadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action,
      entityType: 'cv_timetables',
      entityId: timetable.id,
      userId: actorId,
      metadata: { status: timetable.status, version: timetable.version, ...extraMetadata },
    });
  }
}
