import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { RosterResolver } from './roster-resolver.service';
import { AttendanceProcessor } from './attendance-processor.service';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { LicenseService } from '../../licensing/license.service';

/**
 * NpnlSweepService — early NPNL flagging.
 *
 * For a rostered employee whose shift start time has already passed by more
 * than `npnlGraceMinutes` with no punch and no approved leave, this writes
 * NPNL to DUTYACTUALVALUES proactively rather than waiting for end-of-day /
 * nightly reconciliation to notice. See attendance-config.service.ts for the
 * full rationale.
 *
 * Flow:
 *   1. RosterResolver.findNpnlSweepCandidates() finds every employee whose
 *      shift-start deadline has elapsed today (a cheap, bulk Oracle scan —
 *      no leave/holiday classification yet).
 *   2. For each candidate with no existing attendance_events row today
 *      (i.e. genuinely no punch AND not already flagged by an earlier
 *      sweep), a synthetic 'NEW' AttendanceEvent is created and run through
 *      the exact same AttendanceProcessor.processEvent() pipeline used for
 *      real punches — roster resolution, leave/holiday/week-off
 *      classification, governance gates, audit, and the DUTYACTUALVALUES
 *      write all happen exactly as they would for a real punch. If the
 *      employee turns out to be on approved leave (or it's a holiday/week
 *      off), the existing decision engine naturally classifies it as
 *      LEAVE/HOLIDAY/WEEK_OFF instead of NPNL — this sweep never overrides
 *      that logic, it just triggers it earlier than a real punch would.
 *   3. When the employee later actually punches (IN or OUT), that punch
 *      arrives through the normal ATTLOGS pipeline as a brand new
 *      AttendanceEvent (different sourceId — real punches are never
 *      deduped against this sweep's synthetic marker). AttendanceProcessor
 *      re-resolves the full day's punches from Oracle and
 *      DutyActualUpdater.upsert() MERGE-updates the SAME DUTYACTUALVALUES
 *      row (matched by employeeId + date), overwriting the earlier NPNL
 *      with the correct PRESENT/LATE_COMING/MISSING_OUT/etc. status. No
 *      special "undo NPNL" logic is needed — the existing MERGE semantics
 *      already do this.
 */
@Injectable()
export class NpnlSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private loggedUnlicensedSkip = false;

  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    private readonly rosterResolver: RosterResolver,
    private readonly processor: AttendanceProcessor,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly licenseService: LicenseService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const rc = await this.attendanceConfig.getRuntimeConfig();

    if (!rc.npnlSweepEnabled) {
      this.attendanceLogger.warn('NPNL early-flag sweep disabled', {
        processingStage: 'STARTUP',
        success: true,
        metadata: { reason: 'npnlSweepEnabled=false (ATTENDANCE_NPNL_SWEEP_ENABLED)' },
      });
      return;
    }

    this.attendanceLogger.info('NPNL early-flag sweep started', {
      processingStage: 'STARTUP',
      success: true,
      metadata: { intervalMs: rc.npnlSweepIntervalMs, graceMinutes: rc.npnlGraceMinutes },
    });
    this.sweep().catch(() => {});
    this.timer = setInterval(() => {
      this.sweep().catch(() => {});
    }, rc.npnlSweepIntervalMs);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.attendanceLogger.info('NPNL early-flag sweep stopped', {
      processingStage: 'SHUTDOWN',
      success: true,
    });
  }

  async sweep(): Promise<{ candidates: number; flagged: number }> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — NPNL sweep roster scan paused.', {
          processingStage: 'STARTUP',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return { candidates: 0, flagged: 0 };
    }
    this.loggedUnlicensedSkip = false;

    if (this.running) return { candidates: 0, flagged: 0 };

    this.running = true;
    const startedAt = this.attendanceLogger.time();
    try {
      const rc = await this.attendanceConfig.getRuntimeConfig();
      const candidates = await this.rosterResolver.findNpnlSweepCandidates(
        new Date(),
        rc.npnlGraceMinutes,
        rc.npnlSweepBatchSize,
      );

      let flagged = 0;
      for (const candidate of candidates) {
        try {
          const alreadyHasEvent = await this.hasAnyEventForDay(candidate.employeeCode, candidate.dutyDate);
          if (alreadyHasEvent) continue;

          const sourceId = this.makeSweepSourceId(candidate.employeeCode, candidate.dutyDate);
          const created = this.eventRepo.create({
            sourceId,
            idempotencyKey: sourceId,
            employeeCode: candidate.employeeCode,
            logDateTime: candidate.plannedIn ?? candidate.dutyDate,
            deviceName: null,
            direction: 'UNKNOWN',
            rawDirection: null,
            rawPayload: {
              source: 'NPNL_SWEEP',
              plannedIn: candidate.plannedIn?.toISOString() ?? null,
              graceMinutes: rc.npnlGraceMinutes,
            },
            status: 'NEW',
          });

          let saved: AttendanceEvent;
          try {
            saved = await this.eventRepo.save(created);
          } catch (err) {
            // Unique index on sourceId — another sweep tick (or another
            // replica) already created this candidate's marker between our
            // hasAnyEventForDay() check and this save(). Safe to skip.
            this.attendanceLogger.info('NPNL sweep marker already exists — skipping (race with concurrent sweep)', {
              employeeCode: candidate.employeeCode,
              processingStage: 'ATTENDANCE_DECISION',
              success: true,
              metadata: { sourceId, err: (err as Error).message },
            });
            continue;
          }

          this.attendanceLogger.info('NPNL early-flag: shift-start grace period elapsed with no punch — evaluating', {
            employeeCode: candidate.employeeCode,
            dutyDate: candidate.dutyDate,
            processingStage: 'ATTENDANCE_DECISION',
            success: true,
            metadata: {
              eventId: saved.id,
              plannedIn: candidate.plannedIn?.toISOString() ?? null,
              graceMinutes: rc.npnlGraceMinutes,
            },
          });

          await this.processor.processEvent(saved.id, 'NPNL_SWEEP');
          flagged++;
        } catch (err) {
          this.attendanceLogger.warn('NPNL early-flag failed for one employee — continuing sweep', {
            employeeCode: candidate.employeeCode,
            processingStage: 'ATTENDANCE_DECISION',
            success: false,
            failure: true,
            errorMessage: (err as Error).message,
          });
        }
      }

      this.attendanceLogger.info('NPNL early-flag sweep completed', {
        processingStage: 'PERFORMANCE_METRICS',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { candidateCount: candidates.length, flaggedCount: flagged },
      });
      return { candidates: candidates.length, flagged };
    } catch (err) {
      this.attendanceLogger.warn('NPNL early-flag sweep failed', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
        errorMessage: (err as Error).message,
      });
      return { candidates: 0, flagged: 0 };
    } finally {
      this.running = false;
    }
  }

  /**
   * True if ANY attendance_events row already exists for this
   * employee/day — either a real punch already arrived, or an earlier
   * sweep tick already created the NPNL marker. Either way, this sweep has
   * nothing further to do for this candidate today.
   */
  private async hasAnyEventForDay(employeeCode: string, dutyDate: Date): Promise<boolean> {
    const from = new Date(dutyDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dutyDate);
    to.setHours(23, 59, 59, 999);
    const count = await this.eventRepo.count({ where: { employeeCode, logDateTime: Between(from, to) } });
    return count > 0;
  }

  /**
   * Deterministic per employee/day — doubles as an idempotency guard via
   * the unique index on AttendanceEvent.sourceId (see
   * hasAnyEventForDay()'s catch above for the race-condition case).
   */
  private makeSweepSourceId(employeeCode: string, dutyDate: Date): string {
    return `NPNL_SWEEP:${employeeCode}:${dutyDate.toISOString().slice(0, 10)}`;
  }
}
