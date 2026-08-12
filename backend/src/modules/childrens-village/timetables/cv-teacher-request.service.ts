import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvTimetableChangeRequest, CvChangeRequestType } from './entities/cv-timetable-change-request.entity';
import { CvTimetablePeriod } from './entities/cv-timetable-period.entity';
import { CvTimetablePeriodOverride } from './entities/cv-timetable-period-override.entity';
import { CvTimetable } from './entities/cv-timetable.entity';
import { CvTimetableWorkflowService } from './cv-timetable-workflow.service';
import { CvConflictEngineService } from './cv-conflict-engine.service';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

/** Local calendar-day string helper -- see cv-timetable-lifecycle.service.ts's identical, deliberately-duplicated helper for why this isn't imported/shared. */
function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayParam(): string {
  return toDateParam(new Date());
}

function dateRange(start: string, end: string | null): string[] {
  if (!end || end === start) return [start];
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur.getTime() <= last.getTime()) {
    dates.push(toDateParam(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export interface CreateExchangeDto {
  periodId: string;
  date: string;
  proposedTeacherId: string;
  reason?: string;
}

export interface CreateSwapDto {
  periodId: string;
  counterpartyPeriodId: string;
  date: string;
  reason?: string;
}

export interface CreateSubstituteDto {
  periodId: string;
  substituteTeacherId: string;
  dateStart: string;
  dateEnd?: string;
  reason?: string;
}

/**
 * Timetable Management Phase 7 -- Period Exchange, Mutual Swap, and
 * Substitute Assignment requests, per design spec Sections 2.3-2.5.
 *
 * Deliberately a separate service, not new methods on `CvTimetableService`
 * or `CvTimetableLifecycleService` -- same rationale as Phase 2: this is a
 * different lifecycle (a short-lived request record, not a timetable
 * version) that happens to touch the same underlying tables. Nothing in
 * either of those services is read, written, or otherwise modified by this
 * file.
 *
 * Reuses Phase 6's `CvTimetableWorkflowService.startApproval()` with
 * `sourceType: 'TEACHER_REQUEST'` -- `CvTimetableApprovalCompletionListener`
 * is extended (this phase) to route completion events for that sourceType
 * to `markApprovalOutcome()` below, the same event-based decoupling used
 * for `TIMETABLE_PUBLISH`.
 *
 * Notifications (to counterparty/original teacher/guardians per Section
 * 10) are explicitly NOT sent by this phase -- deferred to Phase 11
 * (integrating the existing NotificationService), matching how Phase 6
 * deferred escalation notifications. Every state transition is still fully
 * audited, so nothing is silently lost, only not yet pushed to anyone.
 */
@Injectable()
export class CvTeacherRequestService {
  constructor(
    @InjectRepository(CvTimetableChangeRequest)
    private readonly writeRepo: Repository<CvTimetableChangeRequest>,
    @Inject(getTenantScopedRepositoryToken(CvTimetableChangeRequest))
    private readonly readRepo: TenantScopedRepository<CvTimetableChangeRequest>,

    @InjectRepository(CvTimetablePeriodOverride)
    private readonly overrideWriteRepo: Repository<CvTimetablePeriodOverride>,

    @Inject(getTenantScopedRepositoryToken(CvTimetablePeriod))
    private readonly periodReadRepo: TenantScopedRepository<CvTimetablePeriod>,
    @Inject(getTenantScopedRepositoryToken(CvTimetable))
    private readonly timetableReadRepo: TenantScopedRepository<CvTimetable>,

    private readonly workflowService: CvTimetableWorkflowService,
    private readonly conflictEngine: CvConflictEngineService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────

  async findByIdOrThrow(id: string): Promise<CvTimetableChangeRequest> {
    const request = await this.readRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Teacher request ${id} not found`);
    return request;
  }

  async listForTeacher(teacherId: string): Promise<CvTimetableChangeRequest[]> {
    const [initiated, counterparty] = await Promise.all([
      this.readRepo.find({ where: { initiatingTeacherId: teacherId }, order: { createdAt: 'DESC' } }),
      this.readRepo.find({ where: { counterpartyTeacherId: teacherId }, order: { createdAt: 'DESC' } }),
    ]);
    const byId = new Map([...initiated, ...counterparty].map((r) => [r.id, r]));
    return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Creation ───────────────────────────────────────────────────────

  private async resolveClassId(timetableId: string): Promise<string | null> {
    const timetable = await this.timetableReadRepo.findOne({ where: { id: timetableId } });
    return timetable?.classId ?? null;
  }

  async createExchangeRequest(actorId: string, dto: CreateExchangeDto): Promise<CvTimetableChangeRequest> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const period = await this.periodReadRepo.findOne({ where: { id: dto.periodId } });
    if (!period) throw new NotFoundException(`Period ${dto.periodId} not found`);
    if (period.teacherId !== actorId) throw new ForbiddenException('You can only request an exchange for your own period');
    if (dto.proposedTeacherId === actorId) throw new BadRequestException('Cannot propose an exchange with yourself');
    if (dto.date < todayParam()) throw new BadRequestException('Cannot request an exchange for a past date');

    const classId = await this.resolveClassId(period.timetableId);

    const request = this.writeRepo.create({
      tenantId,
      requestType: 'EXCHANGE',
      status: 'PENDING_COUNTERPARTY',
      classId,
      initiatingTeacherId: actorId,
      counterpartyTeacherId: dto.proposedTeacherId,
      originalPeriodId: period.id,
      affectedDateStart: dto.date,
      reason: dto.reason ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_EXCHANGE_REQUESTED');
    return saved;
  }

  async createSwapRequest(actorId: string, dto: CreateSwapDto): Promise<CvTimetableChangeRequest> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const [period, counterpartyPeriod] = await Promise.all([
      this.periodReadRepo.findOne({ where: { id: dto.periodId } }),
      this.periodReadRepo.findOne({ where: { id: dto.counterpartyPeriodId } }),
    ]);
    if (!period) throw new NotFoundException(`Period ${dto.periodId} not found`);
    if (!counterpartyPeriod) throw new NotFoundException(`Period ${dto.counterpartyPeriodId} not found`);
    if (period.teacherId !== actorId) throw new ForbiddenException('You can only request a swap for your own period');
    if (counterpartyPeriod.teacherId === actorId) throw new BadRequestException('Cannot swap with your own period');
    if (dto.date < todayParam()) throw new BadRequestException('Cannot request a swap for a past date');

    const classId = await this.resolveClassId(period.timetableId);

    const request = this.writeRepo.create({
      tenantId,
      requestType: 'SWAP',
      status: 'PENDING_COUNTERPARTY',
      classId,
      initiatingTeacherId: actorId,
      counterpartyTeacherId: counterpartyPeriod.teacherId,
      originalPeriodId: period.id,
      counterpartyPeriodId: counterpartyPeriod.id,
      affectedDateStart: dto.date,
      reason: dto.reason ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_SWAP_REQUESTED');
    return saved;
  }

  /**
   * Admin/coordinator action -- gated at the controller by
   * `CV:TEACHER_REQUEST:MANAGE`, not ownership. No counterparty step (per
   * design spec Section 5.3): goes straight to the approval-or-apply path.
   */
  async createSubstituteRequest(actorId: string, dto: CreateSubstituteDto): Promise<CvTimetableChangeRequest> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const period = await this.periodReadRepo.findOne({ where: { id: dto.periodId } });
    if (!period) throw new NotFoundException(`Period ${dto.periodId} not found`);
    if (dto.substituteTeacherId === period.teacherId) {
      throw new BadRequestException('Substitute teacher must differ from the currently assigned teacher');
    }
    if (dto.dateStart < todayParam()) throw new BadRequestException('Cannot request substitution for a past date');
    if (dto.dateEnd && dto.dateEnd < dto.dateStart) throw new BadRequestException('dateEnd cannot be before dateStart');

    const classId = await this.resolveClassId(period.timetableId);

    const request = this.writeRepo.create({
      tenantId,
      requestType: 'SUBSTITUTE',
      status: 'PENDING_COUNTERPARTY', // immediately advanced below -- no real counterparty step for substitutes
      classId,
      initiatingTeacherId: actorId,
      substituteTeacherId: dto.substituteTeacherId,
      originalPeriodId: period.id,
      affectedDateStart: dto.dateStart,
      affectedDateEnd: dto.dateEnd ?? null,
      reason: dto.reason ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_SUBSTITUTE_REQUESTED');

    return this.advanceToApproval(actorId, saved);
  }

  // ── Counterparty response (EXCHANGE / SWAP only) ────────────────────

  async respondToCounterparty(actorId: string, requestId: string, accept: boolean, reason?: string): Promise<CvTimetableChangeRequest> {
    const request = await this.findByIdOrThrow(requestId);
    if (request.status !== 'PENDING_COUNTERPARTY') {
      throw new BadRequestException(`Request is '${request.status}', not awaiting a counterparty response`);
    }
    if (request.counterpartyTeacherId !== actorId) {
      throw new ForbiddenException('Only the proposed counterparty may respond to this request');
    }

    if (!accept) {
      request.status = 'DECLINED';
      request.declineReason = reason ?? null;
      request.updatedBy = actorId;
      const saved = await this.writeRepo.save(request);
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_REQUEST_DECLINED', { reason });
      return saved;
    }

    return this.advanceToApproval(actorId, request);
  }

  /**
   * Shared by counterparty-acceptance (EXCHANGE/SWAP) and
   * substitute-creation (SUBSTITUTE, called immediately, no counterparty
   * step). Mirrors `CvTimetableLifecycleService.publish()`'s approach:
   * ask the workflow engine whether approval is required for this
   * tenant+requestType; if not, apply immediately (zero regression for
   * tenants with no approval configured); if so, park at PENDING_APPROVAL
   * and let `markApprovalOutcome` finish the job once the chain completes.
   */
  private async advanceToApproval(actorId: string, request: CvTimetableChangeRequest): Promise<CvTimetableChangeRequest> {
    const approval = await this.workflowService.startApproval(
      actorId,
      'TEACHER_REQUEST',
      request.id,
      request.requestType,
      request.classId ?? undefined,
    );

    if (approval.required) {
      request.status = 'PENDING_APPROVAL';
      request.approvalInstanceId = approval.instanceId ?? null;
      request.updatedBy = actorId;
      const saved = await this.writeRepo.save(request);
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_REQUEST_PENDING_APPROVAL', { workflowInstanceId: approval.instanceId });
      return saved;
    }

    return this.applyRequest(actorId, request);
  }

  /**
   * Called by `CvTimetableApprovalCompletionListener` once a Phase 6
   * approval instance started by `advanceToApproval` reaches a terminal
   * outcome.
   */
  async markApprovalOutcome(actorId: string, requestId: string, outcome: 'APPROVED' | 'REJECTED'): Promise<CvTimetableChangeRequest> {
    const request = await this.findByIdOrThrow(requestId);
    if (request.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Request is '${request.status}', not awaiting an approval outcome`);
    }

    if (outcome === 'REJECTED') {
      request.status = 'REJECTED';
      request.updatedBy = actorId;
      const saved = await this.writeRepo.save(request);
      await this.logTransition(actorId, saved, 'CV_TIMETABLE_REQUEST_REJECTED');
      return saved;
    }

    return this.applyRequest(actorId, request);
  }

  /**
   * Re-validates conflicts at execution time (defends against races --
   * per design spec Section 2.3, the counterparty may have accepted
   * something else in the meantime) and, if clean, writes the resulting
   * `cv_timetable_period_overrides` row(s). Any HARD_BLOCK conflict moves
   * the request to `BLOCKED` instead of throwing -- a stuck request is
   * recoverable (an admin can inspect and manually resolve), an exception
   * here would just look like a server error.
   */
  private async applyRequest(actorId: string, request: CvTimetableChangeRequest): Promise<CvTimetableChangeRequest> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const originalPeriod = await this.periodReadRepo.findOne({ where: { id: request.originalPeriodId } });
    if (!originalPeriod) throw new NotFoundException(`Period ${request.originalPeriodId} not found`);

    if (request.requestType === 'EXCHANGE' || request.requestType === 'SUBSTITUTE') {
      const incomingTeacherId = (request.requestType === 'EXCHANGE' ? request.counterpartyTeacherId : request.substituteTeacherId)!;
      const dates = dateRange(request.affectedDateStart, request.affectedDateEnd);

      for (const date of dates) {
        const report = await this.conflictEngine.checkAll(
          {
            timetableId: originalPeriod.timetableId,
            classId: request.classId ?? undefined,
            subjectId: originalPeriod.subjectId,
            dayOfWeek: originalPeriod.dayOfWeek,
            startTime: originalPeriod.startTime,
            endTime: originalPeriod.endTime,
            teacherId: incomingTeacherId,
            resourceId: originalPeriod.resourceId ?? undefined,
            excludePeriodId: originalPeriod.id,
          },
          date,
        );
        if (report.hasHardConflicts) {
          return this.blockRequest(actorId, request, report.conflicts.map((c) => c.message).join('; '));
        }
      }

      const overrideIds: string[] = [];
      for (const date of dates) {
        const override = await this.upsertTeacherOverride(
          tenantId, originalPeriod.id, date, incomingTeacherId, originalPeriod.teacherId, request.id, actorId,
        );
        overrideIds.push(override.id);
      }

      request.status = 'COMPLETED';
      request.resultingOverrideIds = overrideIds;
      request.updatedBy = actorId;
      const saved = await this.writeRepo.save(request);
      await this.logTransition(actorId, saved, `CV_TIMETABLE_${request.requestType}_APPLIED`, { overrideIds, dates });
      return saved;
    }

    // SWAP -- both periods must succeed, or neither is applied.
    const counterpartyPeriod = await this.periodReadRepo.findOne({ where: { id: request.counterpartyPeriodId! } });
    if (!counterpartyPeriod) throw new NotFoundException(`Period ${request.counterpartyPeriodId} not found`);
    const date = request.affectedDateStart;

    const [reportA, reportB] = await Promise.all([
      this.conflictEngine.checkAll(
        {
          timetableId: originalPeriod.timetableId,
          classId: request.classId ?? undefined,
          subjectId: originalPeriod.subjectId,
          dayOfWeek: originalPeriod.dayOfWeek,
          startTime: originalPeriod.startTime,
          endTime: originalPeriod.endTime,
          teacherId: counterpartyPeriod.teacherId,
          resourceId: originalPeriod.resourceId ?? undefined,
          excludePeriodId: originalPeriod.id,
        },
        date,
      ),
      this.conflictEngine.checkAll(
        {
          timetableId: counterpartyPeriod.timetableId,
          subjectId: counterpartyPeriod.subjectId,
          dayOfWeek: counterpartyPeriod.dayOfWeek,
          startTime: counterpartyPeriod.startTime,
          endTime: counterpartyPeriod.endTime,
          teacherId: originalPeriod.teacherId,
          resourceId: counterpartyPeriod.resourceId ?? undefined,
          excludePeriodId: counterpartyPeriod.id,
        },
        date,
      ),
    ]);

    if (reportA.hasHardConflicts || reportB.hasHardConflicts) {
      const messages = [...reportA.conflicts, ...reportB.conflicts].map((c) => c.message).join('; ');
      return this.blockRequest(actorId, request, messages);
    }

    const [overrideA, overrideB] = await Promise.all([
      this.upsertTeacherOverride(tenantId, originalPeriod.id, date, counterpartyPeriod.teacherId, originalPeriod.teacherId, request.id, actorId),
      this.upsertTeacherOverride(tenantId, counterpartyPeriod.id, date, originalPeriod.teacherId, counterpartyPeriod.teacherId, request.id, actorId),
    ]);

    request.status = 'COMPLETED';
    request.resultingOverrideIds = [overrideA.id, overrideB.id];
    request.updatedBy = actorId;
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_SWAP_APPLIED', { overrideIds: request.resultingOverrideIds, date });
    return saved;
  }

  private async blockRequest(actorId: string, request: CvTimetableChangeRequest, blockReason: string): Promise<CvTimetableChangeRequest> {
    request.status = 'BLOCKED';
    request.blockReason = blockReason;
    request.updatedBy = actorId;
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_REQUEST_BLOCKED', { blockReason });
    return saved;
  }

  /**
   * `(period_id, date)` is unique on `cv_timetable_period_overrides` --
   * reuses an existing row for that date if the live teacher-workspace
   * `updatePeriod('THIS_DAY', ...)` flow already created one (e.g. a room
   * change on the same date), only setting the teacher-related columns and
   * leaving room/startTime/endTime exactly as they were.
   */
  private async upsertTeacherOverride(
    tenantId: string,
    periodId: string,
    date: string,
    teacherId: string,
    originalTeacherId: string,
    changeRequestId: string,
    actorId: string,
  ): Promise<CvTimetablePeriodOverride> {
    let override = await this.overrideWriteRepo.findOne({ where: { periodId, date, tenantId } });
    if (!override) {
      override = this.overrideWriteRepo.create({ tenantId, periodId, date, createdBy: actorId });
    }
    override.teacherId = teacherId;
    override.originalTeacherId = originalTeacherId;
    override.changeRequestId = changeRequestId;
    override.updatedBy = actorId;
    return this.overrideWriteRepo.save(override);
  }

  // ── Rollback ───────────────────────────────────────────────────────

  /**
   * Reverses a COMPLETED request: nulls out the teacher-override columns
   * on every resulting override row (deleting the row entirely if nothing
   * else -- no independent room/time override -- is left on it), restoring
   * the original recurring-template teacher for that date. Gated at the
   * controller by `CV:TEACHER_REQUEST:MANAGE` -- per design spec Section
   * 2.3, rollback is an "authorized role" action, not self-service.
   */
  async rollback(actorId: string, requestId: string, reason: string): Promise<CvTimetableChangeRequest> {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to roll back a completed request');

    const request = await this.findByIdOrThrow(requestId);
    if (request.status !== 'COMPLETED') {
      throw new BadRequestException(`Only a COMPLETED request can be rolled back (current status: '${request.status}')`);
    }

    for (const overrideId of request.resultingOverrideIds ?? []) {
      const override = await this.overrideWriteRepo.findOne({ where: { id: overrideId } });
      if (!override) continue;

      override.teacherId = null;
      override.originalTeacherId = null;
      override.changeRequestId = null;

      if (override.room == null && override.startTime == null && override.endTime == null) {
        await this.overrideWriteRepo.remove(override);
      } else {
        override.updatedBy = actorId;
        await this.overrideWriteRepo.save(override);
      }
    }

    request.status = 'ROLLED_BACK';
    request.rolledBackAt = new Date();
    request.rolledBackBy = actorId;
    request.rollbackReason = reason;
    request.updatedBy = actorId;
    const saved = await this.writeRepo.save(request);
    await this.logTransition(actorId, saved, 'CV_TIMETABLE_EXCHANGE_ROLLED_BACK', { reason });
    return saved;
  }

  private async logTransition(actorId: string, request: CvTimetableChangeRequest, action: string, extraMetadata?: Record<string, unknown>): Promise<void> {
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action,
      entityType: 'cv_timetable_change_requests',
      entityId: request.id,
      userId: actorId,
      metadata: { status: request.status, requestType: request.requestType, ...extraMetadata },
    });
  }
}
