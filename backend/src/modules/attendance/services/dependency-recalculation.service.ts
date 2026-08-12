/**
 * DependencyRecalculationService — Phase 3
 *
 * Given a routed AttendanceDependencyEvent record, this service finds every
 * AttendanceEvent row that is affected by the dependency change and re-enqueues
 * those events for re-processing via RealtimeQueueService.
 *
 * Scope resolution strategy (driven by DependencyEventScope):
 *
 *   EMPLOYEE — one employee, one duty-date.
 *     → Find all attendance_events for (employeeCode, dutyDate).
 *     → Typical blast radius: 1–3 punch events per shift.
 *
 *   GLOBAL   — holiday: all employees on a specific date.
 *     → Find all attendance_events WHERE logDateTime falls on dutyDate.
 *     → Blast radius capped by DEPENDENCY_GLOBAL_RECALC_LIMIT (default 5000).
 *
 *   CONFIG   — shift-type change: potentially all employees, any date.
 *     → Find events in a configurable lookback window.
 *     → DEPENDENCY_CONFIG_LOOKBACK_DAYS (default 7).
 *     → Blast radius capped by DEPENDENCY_CONFIG_RECALC_LIMIT (default 10000).
 *
 * Deduplication: only one representative event per (employeeCode, date) is
 * enqueued — AttendanceProcessor.processEvent resolves the full roster window,
 * so a second punch on the same date would be redundant work.
 *
 * All enqueued jobs carry mode='DEPENDENCY_RECALC' so audit logs can
 * distinguish dependency-triggered re-evaluation from realtime or nightly runs.
 */

import { Injectable } from '@nestjs/common';
import { Between, MoreThanOrEqual } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { AttendanceDependencyEvent } from '../entities/attendance-dependency-event.entity';
import { RealtimeQueueService } from './realtime-queue.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { AttendanceConfigService } from './attendance-config.service';
import type { DependencyEventScope } from '../events/attendance-dependency-changed.event';

@Injectable()
export class DependencyRecalculationService {
  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    private readonly queueService: RealtimeQueueService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
  ) {}

  /**
   * Finds all AttendanceEvent rows affected by the dependency change, deduplicates
   * them by (employeeCode, date), and re-enqueues each representative event with
   * mode='DEPENDENCY_RECALC'.
   *
   * Returns the number of unique (employeeCode, date) pairs enqueued.
   */
  async resolveAndEnqueue(depRecord: AttendanceDependencyEvent): Promise<number> {
    const startedAt = this.attendanceLogger.time();
    const scope: DependencyEventScope = depRecord.scope ?? 'EMPLOYEE';

    let candidates: AttendanceEvent[] = [];

    if (scope === 'EMPLOYEE') {
      if (!depRecord.employeeCode || !depRecord.dutyDate) {
        this.attendanceLogger.warn('EMPLOYEE-scope dep event missing employeeCode or dutyDate — skipping recalc', {
          processingStage: 'DEPENDENCY_RECALC',
          metadata: { source: depRecord.source, correlationId: depRecord.correlationId },
        });
        return 0;
      }
      candidates = await this.findForEmployee(depRecord.employeeCode, depRecord.dutyDate);
    } else if (scope === 'GLOBAL') {
      if (!depRecord.dutyDate) {
        this.attendanceLogger.warn('GLOBAL-scope dep event missing dutyDate — skipping recalc', {
          processingStage: 'DEPENDENCY_RECALC',
          metadata: { source: depRecord.source, correlationId: depRecord.correlationId },
        });
        return 0;
      }
      candidates = await this.findForDate(depRecord.dutyDate);
    } else {
      // CONFIG scope — lookback window
      candidates = await this.findForLookback();
    }

    const representatives = this.deduplicate(candidates);
    let enqueued = 0;

    for (const event of representatives) {
      try {
        await this.queueService.enqueue(
          event.id,
          event.employeeCode,
          event.logDateTime,
          'DEPENDENCY_RECALC',
        );
        enqueued++;
      } catch {
        // Log individual enqueue failure but continue with remaining events
        this.attendanceLogger.warn('DependencyRecalc failed to enqueue one event — continuing', {
          processingStage: 'DEPENDENCY_RECALC',
          employeeCode: event.employeeCode,
          metadata: {
            source: depRecord.source,
            scope,
            eventId: event.id,
            correlationId: depRecord.correlationId,
          },
        });
      }
    }

    this.attendanceLogger.info('DependencyRecalc resolved and enqueued', {
      processingStage: 'DEPENDENCY_RECALC',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: {
        source:        depRecord.source,
        scope,
        correlationId: depRecord.correlationId,
        candidates:    candidates.length,
        enqueued,
      },
    });

    return enqueued;
  }

  // ── Scope queries ──────────────────────────────────────────────────────────

  private async findForEmployee(employeeCode: string, dutyDate: Date): Promise<AttendanceEvent[]> {
    const { from, to } = this.dayBounds(dutyDate);
    return this.eventRepo.find({
      where: {
        employeeCode,
        logDateTime: Between(from, to),
      },
      order: { logDateTime: 'ASC' },
      take: 100,
    });
  }

  private async findForDate(dutyDate: Date): Promise<AttendanceEvent[]> {
    const { from, to } = this.dayBounds(dutyDate);
    const { depGlobalRecalcLimit: limit } = await this.attendanceConfig.getRuntimeConfig();
    return this.eventRepo.find({
      where: {
        logDateTime: Between(from, to),
      },
      order: { employeeCode: 'ASC', logDateTime: 'ASC' },
      take: limit,
    });
  }

  private async findForLookback(): Promise<AttendanceEvent[]> {
    const { depConfigLookbackDays: days, depConfigRecalcLimit: limit } = await this.attendanceConfig.getRuntimeConfig();
    const from  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.eventRepo.find({
      where: {
        logDateTime: MoreThanOrEqual(from),
      },
      order: { employeeCode: 'ASC', logDateTime: 'ASC' },
      take: limit,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns the UTC midnight-to-midnight bounds for the given date.
   * Used to translate a duty-date (date-only) into a timestamp range that
   * matches stored logDateTime values.
   */
  private dayBounds(dutyDate: Date): { from: Date; to: Date } {
    const dateStr = dutyDate instanceof Date
      ? dutyDate.toISOString().slice(0, 10)
      : String(dutyDate).slice(0, 10);
    return {
      from: new Date(`${dateStr}T00:00:00.000Z`),
      to:   new Date(`${dateStr}T23:59:59.999Z`),
    };
  }

  /**
   * Deduplicates candidate events to one representative per (employeeCode, date).
   * The first (earliest logDateTime) event for each pair is kept, since
   * AttendanceProcessor resolves the entire duty-window from any punch in it.
   */
  private deduplicate(events: AttendanceEvent[]): AttendanceEvent[] {
    const seen   = new Set<string>();
    const result: AttendanceEvent[] = [];
    for (const event of events) {
      const key = `${event.employeeCode}:${event.logDateTime.toISOString().slice(0, 10)}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(event);
      }
    }
    return result;
  }
}
