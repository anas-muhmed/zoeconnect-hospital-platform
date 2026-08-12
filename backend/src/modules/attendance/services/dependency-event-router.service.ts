import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceDependencyChangedEvent } from '../events/attendance-dependency-changed.event';
import { AttendanceDependencyEvent } from '../entities/attendance-dependency-event.entity';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { DependencyRecalculationService } from './dependency-recalculation.service';
import { AttendanceConfigService } from './attendance-config.service';
import { LicenseService } from '../../licensing/license.service';

/**
 * DependencyEventRouter — Phase 3
 *
 * Receives AttendanceDependencyChangedEvent instances emitted by external-system
 * pollers and performs three responsibilities:
 *
 *   1. Persist — every event is immediately written to `attendance_dependency_events`
 *      for auditability and replay.
 *
 *   2. Debounce (DUTY_PLAN only) — DutyPlan edits often arrive as a burst of
 *      consecutive saves.  The router holds DUTY_PLAN events in DEBOUNCED state
 *      for a configurable window (DEPENDENCY_DUTYPLAN_DEBOUNCE_MS, default 5 s)
 *      and only promotes the latest event in a burst to PENDING once the window
 *      elapses.  A background timer flushes debounced events every second.
 *
 *   3. Route — events are dispatched to DependencyRecalculationService, which
 *      finds all affected attendance events (by scope: EMPLOYEE / GLOBAL / CONFIG)
 *      and re-enqueues them for re-processing with mode='DEPENDENCY_RECALC'.
 *
 * Architectural constraints (Master Task):
 *   • Internal components MUST NEVER poll — this service is push-driven only.
 *   • Provisional states NEVER written to Oracle HIS.
 *   • All calculations must be idempotent.
 *   • DutyPlan debounce interval is configurable via env var.
 */
@Injectable()
export class DependencyEventRouter
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  /** Key: `${source}:${employeeCode ?? 'ALL'}:${dutyDate?.toISOString() ?? 'ALL'}` */
  private readonly debounceMap = new Map<string, { eventId: string; until: Date }>();
  private debounceFlushTimer: NodeJS.Timeout | null = null;
  private loggedUnlicensedSkip = false;

  constructor(
    @InjectRepository(AttendanceDependencyEvent)
    private readonly depEventRepo: Repository<AttendanceDependencyEvent>,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly recalcService: DependencyRecalculationService,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    if (!rc.depRouterEnabled) {
      this.attendanceLogger.warn('DependencyEventRouter disabled', {
        processingStage: 'STARTUP',
        success: true,
        metadata: { reason: 'depRouterEnabled=false (DEPENDENCY_ROUTER_ENABLED)' },
      });
      return;
    }

    // Flush debounced DUTY_PLAN events every second
    this.debounceFlushTimer = setInterval(() => {
      this.flushDebounced().catch(() => {});
    }, 1_000);

    this.attendanceLogger.info('DependencyEventRouter started', {
      processingStage: 'STARTUP',
      success: true,
      metadata: {
        debounceMs: await this.debounceWindowMs(),
      },
    });
  }

  onApplicationShutdown(): void {
    if (this.debounceFlushTimer) {
      clearInterval(this.debounceFlushTimer);
      this.debounceFlushTimer = null;
    }
    this.debounceMap.clear();
    this.attendanceLogger.info('DependencyEventRouter stopped', {
      processingStage: 'SHUTDOWN',
      success: true,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Primary entry point called by external-system pollers.
   *
   * Persists the event, applies debounce for DUTY_PLAN events, and for all
   * other sources immediately dispatches to the recalculation engine.
   */
  async route(event: AttendanceDependencyChangedEvent): Promise<void> {
    const startedAt = this.attendanceLogger.time();

    // 1. Persist
    const record = await this.persist(event);

    try {
      if (event.source === 'DUTY_PLAN') {
        await this.applyDebounce(record);
      } else {
        await this.dispatchToRecalcEngine(record);
      }

      this.attendanceLogger.info('DependencyEvent routed', {
        processingStage: 'DEPENDENCY_ROUTING',
        employeeCode: event.employeeCode ?? undefined,
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: {
          source:        event.source,
          scope:         event.scope,
          status:        record.status,
          correlationId: event.correlationId,
          dutyDate:      event.dutyDate?.toISOString() ?? null,
        },
      });
    } catch (err) {
      record.status    = 'FAILED';
      record.lastError = (err as Error).message;
      await this.depEventRepo.save(record);

      this.attendanceLogger.warn('DependencyEvent routing failed', {
        processingStage: 'DEPENDENCY_ROUTING',
        employeeCode: event.employeeCode ?? undefined,
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: false,
        failure: true,
        errorMessage: (err as Error).message,
        metadata: { source: event.source, correlationId: event.correlationId },
      });
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async persist(event: AttendanceDependencyChangedEvent): Promise<AttendanceDependencyEvent> {
    const record = this.depEventRepo.create({
      source:        event.source,
      scope:         event.scope,
      employeeCode:  event.employeeCode,
      dutyDate:      event.dutyDate,
      triggeredAt:   event.triggeredAt,
      status:        'PENDING',
      payload:       event.payload,
      correlationId: event.correlationId,
      debounceUntil: null,
      lastError:     null,
    });
    return this.depEventRepo.save(record);
  }

  // ── Debounce (DUTY_PLAN only) ──────────────────────────────────────────────

  private async applyDebounce(record: AttendanceDependencyEvent): Promise<void> {
    const windowMs  = await this.debounceWindowMs();
    const until     = new Date(Date.now() + windowMs);
    const key       = this.debounceKey(record);

    // Update or replace the in-memory debounce entry.  If a previous event for
    // the same (employee, dutyDate) burst is already debounced in the DB, mark
    // it SKIPPED so only the most recent event gets processed.
    const previous = this.debounceMap.get(key);
    if (previous) {
      await this.depEventRepo.update(previous.eventId, { status: 'SKIPPED' });
    }

    record.status        = 'DEBOUNCED';
    record.debounceUntil = until;
    await this.depEventRepo.save(record);

    this.debounceMap.set(key, { eventId: record.id, until });
  }

  /**
   * Called every second by the background timer.
   * Promotes debounced events whose window has elapsed to PENDING and routes them.
   */
  private async flushDebounced(): Promise<void> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — DutyPlan dependency poll flush paused.', {
          processingStage: 'DEPENDENCY_ROUTING',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    const now  = new Date();

    for (const [key, entry] of this.debounceMap.entries()) {
      if (entry.until <= now) {
        this.debounceMap.delete(key);
      }
    }

    // Fetch all DEBOUNCED records whose window has expired and dispatch them
    const dueRecords = await this.depEventRepo
      .createQueryBuilder('e')
      .where("e.status = 'DEBOUNCED'")
      .andWhere('e.debounce_until <= :now', { now })
      .getMany();

    for (const record of dueRecords) {
      record.status = 'PENDING';
      await this.depEventRepo.save(record);
      await this.dispatchToRecalcEngine(record);
    }
  }

  // ── Recalculation dispatch (Phase 3) ──────────────────────────────────────

  /**
   * Resolves the blast radius for the dependency event (by scope) and enqueues
   * the affected attendance events for re-processing.
   *
   * On completion, marks the dependency event record as ROUTED.
   */
  private async dispatchToRecalcEngine(record: AttendanceDependencyEvent): Promise<void> {
    const enqueued = await this.recalcService.resolveAndEnqueue(record);

    this.attendanceLogger.info('DependencyEvent dispatched to recalc engine', {
      processingStage: 'DEPENDENCY_RECALC',
      employeeCode:    record.employeeCode ?? undefined,
      success:         true,
      metadata: {
        source:        record.source,
        scope:         record.scope ?? 'EMPLOYEE',
        enqueued,
        correlationId: record.correlationId,
        dutyDate:      record.dutyDate?.toISOString() ?? null,
      },
    });

    record.status = 'ROUTED';
    await this.depEventRepo.save(record);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private debounceKey(record: AttendanceDependencyEvent): string {
    return [
      record.source,
      record.employeeCode ?? 'ALL',
      record.dutyDate?.toISOString() ?? 'ALL',
    ].join(':');
  }

  private async debounceWindowMs(): Promise<number> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    return rc.depDutyplanDebounceMs;
  }
}
