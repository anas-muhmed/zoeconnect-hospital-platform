import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { RosterResolver } from './roster-resolver.service';
import { ShiftRuleEngine } from './shift-rule-engine.service';
import { PunchHistoryService } from './punch-history.service';
import { AttendanceDecisionEngine } from './attendance-decision-engine.service';
import { DutyActualUpdater } from './duty-actual-updater.service';
import { AttendanceAuditService } from './attendance-audit.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { DependencySnapshotService } from './dependency-snapshot.service';
import { AttendanceGovernanceService } from './attendance-governance.service';
import type { AttendanceProcessingMode } from '../attendance.types';

@Injectable()
export class AttendanceProcessor {
  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    private readonly rosterResolver: RosterResolver,
    private readonly ruleEngine: ShiftRuleEngine,
    private readonly punchHistory: PunchHistoryService,
    private readonly decisionEngine: AttendanceDecisionEngine,
    private readonly actualUpdater: DutyActualUpdater,
    private readonly auditService: AttendanceAuditService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly snapshotService: DependencySnapshotService,
    private readonly governanceService: AttendanceGovernanceService,
  ) {}

  async processEvent(eventId: string, mode: AttendanceProcessingMode = 'REALTIME'): Promise<void> {
    const startedAt = this.attendanceLogger.time();
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) return;

    event.status = 'PROCESSING';
    event.attemptCount += 1;
    await this.eventRepo.save(event);
    this.attendanceLogger.info('Attendance event processing started', {
      employeeCode: event.employeeCode,
      attlogId: event.sourceId,
      punchDirection: event.direction,
      punchTime: event.logDateTime,
      processingStage: 'QUEUE_PROCESSING',
      success: true,
      metadata: { eventId, mode, attemptCount: event.attemptCount },
    });

    try {
      const roster = await this.rosterResolver.resolve(event.employeeCode, event.logDateTime);
      const rules = await this.ruleEngine.getRulesFor(roster);
      const window = this.ruleEngine.getEvaluationWindow(roster, rules);
      const punches = await this.punchHistory.getSourcePunchesForWindow(event.employeeCode, window.from, window.to);
      const oldValue = await this.actualUpdater.getCurrentActual(roster);
      roster.actualStatus = oldValue ? String(oldValue['ATTENDANCE'] ?? oldValue['attendance'] ?? '') : null;
      const decision = this.decisionEngine.evaluate(roster, punches, rules);

      this.attendanceLogger.info('Attendance decision evaluated', {
        employeeCode: roster.employeeCode,
        employeeId: roster.employeeId,
        dutyDate: roster.dutyDate,
        shiftCode: roster.shiftCode,
        attlogId: event.sourceId,
        punchDirection: event.direction,
        punchTime: event.logDateTime,
        processingStage: 'ATTENDANCE_DECISION',
        decision: decision.status,
        success: true,
        metadata: {
          reasonCode: decision.reasonCode,
          punchCount: decision.punchCount,
          inPunch: decision.inPunch?.toISOString() ?? null,
          outPunch: decision.outPunch?.toISOString() ?? null,
          lateMinutes: decision.lateMinutes,
          earlyGoingMinutes: decision.earlyGoingMinutes,
          workMinutes: decision.workMinutes,
          requiresManualReview: decision.requiresManualReview,
        },
      });

      // Ineligibility gate: an employee who isn't considered for punch
      // tracking at all (EMPLOYEE.ISPUNCHREQUIRED=0, inactive EMP_STATUS,
      // relieved per PMS_EMPLOYEE.RELIEVINGDATE, or no currently-ACTIVE
      // EMPLOYEESCMAPFORDUTYROSTER mapping) must NEVER get a DUTYACTUALVALUES
      // row written — not even a placeholder. Short-circuit before the
      // governance gate and before actualUpdater.upsert() is ever called.
      if (decision.status === 'INELIGIBLE') {
        this.attendanceLogger.info('Attendance event skipped — employee not eligible for punch tracking', {
          employeeCode: roster.employeeCode,
          employeeId: roster.employeeId,
          dutyDate: roster.dutyDate,
          attlogId: event.sourceId,
          punchDirection: event.direction,
          punchTime: event.logDateTime,
          processingStage: 'ATTENDANCE_DECISION',
          decision: decision.status,
          success: true,
          metadata: { reason: decision.reason },
        });
        event.status = 'SKIPPED';
        event.decisionStatus = decision.status;
        event.lastError = null;
        event.processedAt = new Date();
        await this.eventRepo.save(event);
        return;
      }

      // ── Phase 5: Governance gate ────────────────────────────────────────────
      // 1) Manual override check (existing DUTYACTUALVALUES.REMARKS logic)
      if (this.isManualOverride(oldValue)) {
        decision.requiresManualReview = true;
        decision.reasonCode = 'MANUAL_ATTENDANCE_OVERRIDE';
        decision.reason = 'Manual Attendance Override.';
        this.attendanceLogger.warn('Manual attendance override detected; write skipped', {
          employeeCode: roster.employeeCode,
          employeeId: roster.employeeId,
          dutyDate: roster.dutyDate,
          shiftCode: roster.shiftCode,
          attlogId: event.sourceId,
          punchDirection: event.direction,
          punchTime: event.logDateTime,
          processingStage: 'GOVERNANCE_CHECK',
          decision: decision.status,
          success: true,
          metadata: { oldAttendance: roster.actualStatus },
        });
        event.status = 'SKIPPED';
        event.decisionStatus = decision.status;
        event.lastError = null;
        event.processedAt = new Date();
        await this.eventRepo.save(event);

        await this.governanceService.recordSkip({
          employeeCode:      roster.employeeCode,
          dutyDate:          roster.dutyDate,
          skipReason:        'MANUAL_OVERRIDE',
          mode,
          attendanceEventId: event.id,
          metadata:          { oldAttendance: roster.actualStatus, reasonCode: decision.reasonCode },
          intraBranchId:     roster.intraBranchId,
        });
        await this.snapshotService.capture({
          employeeCode: roster.employeeCode,
          dutyDate:     roster.dutyDate,
          hdspDecision: decision.status,
          shiftCode:    roster.shiftCode ?? null,
          mode,
          intraBranchId: roster.intraBranchId,
        });
        return;
      }

      // 2) Payroll lock check
      if (roster.employeeId) {
        const govDecision = await this.governanceService.canWrite(roster.employeeCode, roster.dutyDate, mode);
        if (!govDecision.allowed) {
          this.attendanceLogger.warn('Attendance write blocked by governance lock', {
            employeeCode: roster.employeeCode,
            employeeId: roster.employeeId,
            dutyDate: roster.dutyDate,
            shiftCode: roster.shiftCode,
            attlogId: event.sourceId,
            processingStage: 'GOVERNANCE_CHECK',
            decision: decision.status,
            success: true,
            metadata: { lockId: govDecision.lockId, reason: govDecision.reason, mode },
          });
          event.status = 'SKIPPED';
          event.decisionStatus = decision.status;
          event.lastError = null;
          event.processedAt = new Date();
          await this.eventRepo.save(event);

          await this.governanceService.recordSkip({
            employeeCode:      roster.employeeCode,
            dutyDate:          roster.dutyDate,
            skipReason:        govDecision.reason!,
            mode,
            attendanceEventId: event.id,
            metadata:          { lockId: govDecision.lockId },
            intraBranchId:     roster.intraBranchId,
          });
          return;
        }
      }
      // ── End governance gate ─────────────────────────────────────────────────

      const newValue = roster.employeeId
        ? await this.actualUpdater.upsert(roster, decision)
        : {
          employeeCode: roster.employeeCode,
          employeeId: null,
          dutyDate: roster.dutyDate.toISOString().slice(0, 10),
          status: decision.status,
          skipped: true,
          reason: 'Employee code from ATTLOGS could not be mapped to EMPLOYEE.EMPNO',
        };

      event.status = decision.status === 'NO_ROSTER' || decision.status === 'INVALID' ? 'SKIPPED' : 'PROCESSED';
      event.decisionStatus = decision.status;
      event.lastError = null;
      event.processedAt = new Date();
      await this.eventRepo.save(event);

      await this.auditService.record({
        eventId: event.id,
        roster,
        decision,
        mode,
        oldValue,
        newValue,
      });

      // Phase 4: capture snapshot for HIS reconciliation (best-effort, never throws)
      await this.snapshotService.capture({
        employeeCode: roster.employeeCode,
        dutyDate:     roster.dutyDate,
        hdspDecision: decision.status,
        shiftCode:    roster.shiftCode ?? null,
        mode,
      });

      this.attendanceLogger.info('Attendance event processing completed', {
        employeeCode: roster.employeeCode,
        employeeId: roster.employeeId,
        dutyDate: roster.dutyDate,
        shiftCode: roster.shiftCode,
        attlogId: event.sourceId,
        punchDirection: event.direction,
        punchTime: event.logDateTime,
        processingStage: 'PERFORMANCE_METRICS',
        decision: decision.status,
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { eventId, mode },
      });
    } catch (err) {
      event.status = event.attemptCount >= 5 ? 'DEAD_LETTER' : 'FAILED';
      event.lastError = (err as Error).message;
      await this.eventRepo.save(event);
      this.attendanceLogger.error('Attendance event processing failed', {
        employeeCode: event.employeeCode,
        attlogId: event.sourceId,
        punchDirection: event.direction,
        punchTime: event.logDateTime,
        processingStage: 'RETRY_LOGIC',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        metadata: {
          eventId,
          mode,
          attemptCount: event.attemptCount,
          nextStatus: event.status,
          willRetry: event.status !== 'DEAD_LETTER',
        },
      }, err);
      throw err;
    }
  }

  private isManualOverride(oldValue: Record<string, unknown> | null): boolean {
    if (!oldValue) return false;
    const remarks = String(oldValue['REMARKS'] ?? oldValue['remarks'] ?? '').trim();
    if (!remarks) return false;
    return !remarks.startsWith('ZoeConnect realtime:');
  }
}
