import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { OraclePollingService } from './oracle-polling.service';
import { PunchHistoryService } from './punch-history.service';
import { RealtimeQueueService } from './realtime-queue.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { AttendanceConfigService } from './attendance-config.service';
import { LicenseService } from '../../licensing/license.service';
import type { AttendanceEvent } from '../entities/attendance-event.entity';
import type { AttlogPunch } from '../attendance.types';

@Injectable()
export class AttendanceListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private backfillTimer: NodeJS.Timeout | null = null;
  private running = false;
  private backfillRunning = false;
  private loggedUnlicensedSkip = false;

  constructor(
    private readonly pollingService: OraclePollingService,
    private readonly punchHistory: PunchHistoryService,
    private readonly queueService: RealtimeQueueService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const rc = await this.attendanceConfig.getRuntimeConfig();

    if (!rc.realtimeEnabled) {
      this.attendanceLogger.warn('Attendance realtime listener disabled', {
        processingStage: 'STARTUP',
        success: true,
        metadata: { reason: 'realtimeEnabled=false (ATTENDANCE_REALTIME_ENABLED)' },
      });
      return;
    }

    this.attendanceLogger.info('Attendance realtime listener started', {
      processingStage: 'STARTUP',
      success: true,
      metadata: { intervalMs: rc.pollIntervalMs },
    });
    this.tick().catch(() => {});
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, rc.pollIntervalMs);

    if (rc.backfillEnabled) {
      this.attendanceLogger.info('Attendance backfill safety-net sweep started', {
        processingStage: 'STARTUP',
        success: true,
        metadata: { intervalMs: rc.backfillIntervalMs, windowDays: rc.backfillWindowDays },
      });
      this.backfillTick().catch(() => {});
      this.backfillTimer = setInterval(() => {
        this.backfillTick().catch(() => {});
      }, rc.backfillIntervalMs);
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.backfillTimer) clearInterval(this.backfillTimer);
    this.backfillTimer = null;
    this.attendanceLogger.info('Attendance realtime listener stopped', {
      processingStage: 'SHUTDOWN',
      success: true,
    });
  }

  async tick(): Promise<number> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — realtime polling tick paused.', {
          processingStage: 'STARTUP',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return 0;
    }
    this.loggedUnlicensedSkip = false;

    if (this.running) return 0;

    this.running = true;
    const startedAt = this.attendanceLogger.time();
    try {
      const { pollBatchSize } = await this.attendanceConfig.getRuntimeConfig();
      const punches = await this.pollingService.fetchNewPunches(pollBatchSize);
      const queued = await this.processDetectedPunches(punches);
      this.attendanceLogger.info('Attendance polling tick completed', {
        processingStage: 'PERFORMANCE_METRICS',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { detectedCount: punches.length, queuedCount: queued },
      });
      return queued;
    } catch (err) {
      this.attendanceLogger.warn('Attendance polling tick failed', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
        errorMessage: (err as Error).message,
      });
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Safety-net sweep: re-scans a trailing LOGDATETIME window in ATTLOGS,
   * independent of the CREATEDDATETIME cursor used by tick(). Catches
   * punches that would otherwise be permanently invisible to the cursor —
   * e.g. a device/eSSL sync outage of several days whose backfilled rows
   * don't advance the cursor as expected. Safe to run repeatedly on
   * overlapping windows: recordDiscoveredPunch() dedupes by sourceId, so
   * already-known punches are simply returned as-is and skipped below.
   */
  async backfillTick(): Promise<number> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — backfill safety-net sweep paused.', {
          processingStage: 'STARTUP',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return 0;
    }
    this.loggedUnlicensedSkip = false;

    if (this.backfillRunning) return 0;

    this.backfillRunning = true;
    const startedAt = this.attendanceLogger.time();
    try {
      const { backfillWindowDays, backfillBatchSize } = await this.attendanceConfig.getRuntimeConfig();
      const punches = await this.pollingService.fetchBackfillPunches(backfillWindowDays, backfillBatchSize);
      const queued = await this.processDetectedPunches(punches);
      this.attendanceLogger.info('Attendance backfill sweep completed', {
        processingStage: 'PERFORMANCE_METRICS',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { windowDays: backfillWindowDays, scannedCount: punches.length, queuedCount: queued },
      });
      return queued;
    } catch (err) {
      this.attendanceLogger.warn('Attendance backfill sweep failed', {
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
        errorMessage: (err as Error).message,
      });
      return 0;
    } finally {
      this.backfillRunning = false;
    }
  }

  /**
   * Shared per-punch handling for both tick() (cursor-driven, fast) and
   * backfillTick() (window-driven, safety net). Records/dedupes each punch
   * as an AttendanceEvent and enqueues anything not already terminal.
   */
  private async processDetectedPunches(punches: AttlogPunch[]): Promise<number> {
    const { staleQueuedMs } = await this.attendanceConfig.getRuntimeConfig();
    let queued = 0;
    for (const punch of punches) {
      const event = await this.punchHistory.recordDiscoveredPunch(punch);
      this.attendanceLogger.info('ATTLOGS punch detected', {
        employeeCode: punch.employeeCode,
        attlogId: punch.sourceId,
        punchDirection: punch.direction,
        punchTime: punch.logDateTime,
        processingStage: 'ATTLOGS_DETECTION',
        success: true,
        metadata: { deviceName: punch.deviceName, wasExistingEvent: event.status !== 'NEW' },
      });

      if (event.status === 'PROCESSED' || event.status === 'SKIPPED') continue;

      if (event.status === 'DEAD_LETTER') {
        // DEAD_LETTER is terminal: attemptCount has already reached the
        // retry ceiling (>=5, see attendance-processor.service.ts) and is
        // NEVER reset just by re-enqueuing. Falling through here would
        // re-enqueue the event on every sweep forever — each new attempt
        // fails the same way and re-saves attemptCount+1, which is already
        // >=5, so it goes straight back to DEAD_LETTER every time (observed
        // in production: attemptCount climbing past 260+ for one event).
        // DEAD_LETTER rows must be revived explicitly via
        // reprocessEvent()/reprocessWindow(), never picked up here.
        continue;
      }

      if (event.status === 'QUEUED') {
        // A 'QUEUED' event normally means a live Bull job is already
        // driving it — but if that job was lost (e.g. a previous enqueue
        // silently deduped against a stale jobId, or Redis lost the job),
        // the row is orphaned: nothing will ever move it forward, and it
        // would otherwise be skipped here forever. Only re-enqueue once
        // it's been sitting QUEUED for longer than staleQueuedMs, so a
        // genuinely in-flight job isn't double-processed.
        const ageMs = Date.now() - event.updatedAt.getTime();
        if (ageMs < staleQueuedMs) continue;

        this.attendanceLogger.warn('Recovering event stuck at QUEUED — re-enqueuing (likely an orphaned/lost Bull job)', {
          employeeCode: event.employeeCode,
          attlogId: event.sourceId,
          processingStage: 'QUEUE_PUBLISH',
          success: true,
          metadata: { eventId: event.id, ageMs },
        });
      }

      // GAP-09 fix: persist QUEUED status to DB before enqueuing so the
      // status change is durable.  Previously this save was missing.
      const savedEvent = await this.punchHistory.markAsQueued(event);
      await this.queueService.enqueue(savedEvent.id, savedEvent.employeeCode, savedEvent.logDateTime);
      queued++;
    }
    return queued;
  }

  /**
   * Explicitly revives a single FAILED/DEAD_LETTER event: resets status +
   * attemptCount together (see PunchHistoryService.resetForReprocessing —
   * resetting status alone is not enough) and re-enqueues it immediately.
   */
  async reprocessEvent(eventId: string): Promise<{ ok: boolean; reason?: string }> {
    const event = await this.punchHistory.findEventById(eventId);
    if (!event) return { ok: false, reason: 'not_found' };
    if (event.status !== 'FAILED' && event.status !== 'DEAD_LETTER') {
      return { ok: false, reason: `event is '${event.status}', not FAILED/DEAD_LETTER` };
    }

    const reset = await this.punchHistory.resetForReprocessing(event);
    const queued = await this.punchHistory.markAsQueued(reset);
    await this.queueService.enqueue(queued.id, queued.employeeCode, queued.logDateTime);

    this.attendanceLogger.info('Manually reprocessing event (attemptCount reset)', {
      employeeCode: queued.employeeCode,
      attlogId: queued.sourceId,
      processingStage: 'QUEUE_PUBLISH',
      success: true,
      metadata: { eventId: queued.id },
    });
    return { ok: true };
  }

  /**
   * Bulk version of reprocessEvent() for clearing a DEAD_LETTER/FAILED
   * backlog over a date window in one call.
   */
  async reprocessWindow(
    from: Date,
    to: Date,
    statuses: AttendanceEvent['status'][] = ['FAILED', 'DEAD_LETTER'],
  ): Promise<{ total: number; queued: number }> {
    const events = await this.punchHistory.findEventsForReprocessing(from, to, statuses);
    let queued = 0;
    for (const event of events) {
      const reset = await this.punchHistory.resetForReprocessing(event);
      const savedEvent = await this.punchHistory.markAsQueued(reset);
      await this.queueService.enqueue(savedEvent.id, savedEvent.employeeCode, savedEvent.logDateTime);
      queued++;
    }
    this.attendanceLogger.info('Bulk reprocess of FAILED/DEAD_LETTER backlog completed', {
      processingStage: 'QUEUE_PUBLISH',
      success: true,
      metadata: { from: from.toISOString(), to: to.toISOString(), statuses, total: events.length, queued },
    });
    return { total: events.length, queued };
  }
}
