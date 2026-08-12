/**
 * RetroactiveRecalculationService — Phase 5
 *
 * Allows administrators to trigger attendance re-evaluation for:
 *   - A single employee over a date range
 *   - All employees in a department over a date range
 *   - All employees (hospital-wide) over a date range
 *
 * All triggers respect governance locks:
 *   - EMPLOYEE locks block individual employee recalculation
 *   - DEPARTMENT locks block the entire department trigger
 *   - ALL locks block hospital-wide trigger (and any sub-trigger)
 *
 * Deduplication: one representative event per (employeeCode, date) is enqueued,
 * identical to DependencyRecalculationService.
 *
 * Mode: 'RETROACTIVE' so audit logs clearly distinguish admin-triggered
 * re-evaluation from realtime, dependency-recalc, or reconciliation runs.
 *
 * Env vars:
 *   RETROACTIVE_RECALC_BATCH_LIMIT  — max events to enqueue per call (default 20000)
 */

import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { RealtimeQueueService } from './realtime-queue.service';
import { AttendanceGovernanceService } from './attendance-governance.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { AttendanceConfigService } from './attendance-config.service';

export interface RetroactiveResult {
  employeesProcessed: number;
  eventsEnqueued: number;
  eventsSkipped: number;
  errors: number;
}

@Injectable()
export class RetroactiveRecalculationService {
  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    private readonly queueService: RealtimeQueueService,
    private readonly governanceService: AttendanceGovernanceService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
  ) {}

  /**
   * Re-enqueue all attendance events for a single employee in [from, to].
   */
  async triggerForEmployee(
    employeeCode: string,
    from: Date,
    to: Date,
    triggeredBy = 'SYSTEM',
  ): Promise<RetroactiveResult> {
    const startedAt = this.attendanceLogger.time();
    const result: RetroactiveResult = { employeesProcessed: 0, eventsEnqueued: 0, eventsSkipped: 0, errors: 0 };

    const limit = await this.batchLimit();
    const candidates = await this.eventRepo.find({
      where: { employeeCode, logDateTime: Between(from, to) },
      order: { logDateTime: 'ASC' },
      take: limit,
    });

    const representatives = this.deduplicate(candidates);

    for (const event of representatives) {
      const govDecision = await this.governanceService.canWrite(employeeCode, event.logDateTime, 'RETROACTIVE');
      if (!govDecision.allowed) {
        await this.governanceService.recordSkip({
          employeeCode,
          dutyDate:          event.logDateTime,
          skipReason:        govDecision.reason!,
          mode:              'RETROACTIVE',
          attendanceEventId: event.id,
          metadata:          { lockId: govDecision.lockId, triggeredBy },
        });
        result.eventsSkipped++;
        continue;
      }
      try {
        await this.queueService.enqueue(event.id, event.employeeCode, event.logDateTime, 'RETROACTIVE');
        result.eventsEnqueued++;
      } catch {
        result.errors++;
      }
    }

    result.employeesProcessed = result.eventsEnqueued + result.eventsSkipped > 0 ? 1 : 0;

    this.attendanceLogger.info('Retroactive recalculation triggered for employee', {
      processingStage: 'RETROACTIVE_RECALC',
      employeeCode,
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { from: from.toISOString(), to: to.toISOString(), triggeredBy, ...result },
    });

    return result;
  }

  /**
   * Re-enqueue attendance events for all employees belonging to a department.
   * Fetches employee codes from Oracle EMPLOYEE table filtered by DEPT_ID.
   */
  async triggerForDepartment(
    departmentCode: string,
    from: Date,
    to: Date,
    triggeredBy = 'SYSTEM',
  ): Promise<RetroactiveResult> {
    const startedAt = this.attendanceLogger.time();
    const result: RetroactiveResult = { employeesProcessed: 0, eventsEnqueued: 0, eventsSkipped: 0, errors: 0 };

    // Check blanket DEPARTMENT lock
    const deptLock = await this.governanceService.isDepartmentLocked(departmentCode, from);
    if (deptLock) {
      this.attendanceLogger.warn('Retroactive recalculation blocked by DEPARTMENT lock', {
        processingStage: 'RETROACTIVE_RECALC',
        metadata: { departmentCode, lockId: deptLock.id, triggeredBy },
      });
      return result;
    }

    // Fetch employee codes from Oracle
    let employeeCodes: string[] = [];
    try {
      employeeCodes = await this.fetchEmployeesForDepartment(departmentCode);
    } catch (err) {
      this.attendanceLogger.error('RetroactiveRecalc: failed to fetch employees for department', {
        processingStage: 'RETROACTIVE_RECALC',
        metadata: { departmentCode, triggeredBy },
      }, err);
      result.errors++;
      return result;
    }

    for (const employeeCode of employeeCodes) {
      const sub = await this.triggerForEmployee(employeeCode, from, to, triggeredBy);
      result.employeesProcessed += sub.employeesProcessed;
      result.eventsEnqueued     += sub.eventsEnqueued;
      result.eventsSkipped      += sub.eventsSkipped;
      result.errors             += sub.errors;
    }

    this.attendanceLogger.info('Retroactive recalculation triggered for department', {
      processingStage: 'RETROACTIVE_RECALC',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { departmentCode, from: from.toISOString(), to: to.toISOString(), triggeredBy, employeeCount: employeeCodes.length, ...result },
    });

    return result;
  }

  /**
   * Re-enqueue attendance events for ALL employees in [from, to].
   * Fetches every event in the window, deduplicates by (employeeCode, date),
   * and applies governance checks per employee.
   */
  async triggerForAll(
    from: Date,
    to: Date,
    triggeredBy = 'SYSTEM',
  ): Promise<RetroactiveResult> {
    const startedAt = this.attendanceLogger.time();
    const result: RetroactiveResult = { employeesProcessed: 0, eventsEnqueued: 0, eventsSkipped: 0, errors: 0 };
    const seenEmployees = new Set<string>();

    const limit = await this.batchLimit();
    const candidates = await this.eventRepo.find({
      where: { logDateTime: Between(from, to) },
      order: { employeeCode: 'ASC', logDateTime: 'ASC' },
      take: limit,
    });

    const representatives = this.deduplicate(candidates);

    for (const event of representatives) {
      const govDecision = await this.governanceService.canWrite(event.employeeCode, event.logDateTime, 'RETROACTIVE');
      if (!govDecision.allowed) {
        await this.governanceService.recordSkip({
          employeeCode:      event.employeeCode,
          dutyDate:          event.logDateTime,
          skipReason:        govDecision.reason!,
          mode:              'RETROACTIVE',
          attendanceEventId: event.id,
          metadata:          { lockId: govDecision.lockId, triggeredBy },
        });
        result.eventsSkipped++;
        continue;
      }
      try {
        await this.queueService.enqueue(event.id, event.employeeCode, event.logDateTime, 'RETROACTIVE');
        result.eventsEnqueued++;
        seenEmployees.add(event.employeeCode);
      } catch {
        result.errors++;
      }
    }

    result.employeesProcessed = seenEmployees.size;

    this.attendanceLogger.info('Retroactive recalculation triggered for all employees', {
      processingStage: 'RETROACTIVE_RECALC',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { from: from.toISOString(), to: to.toISOString(), triggeredBy, ...result },
    });

    return result;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fetchEmployeesForDepartment(departmentCode: string): Promise<string[]> {
    const { retroDeptEmpLimit: limit } = await this.attendanceConfig.getRuntimeConfig();
    const rows = await this.oracle.query<{ EMPNO: string }>(
      `SELECT e.EMPNO FROM EMPLOYEE e WHERE e.DEPT_ID = :deptCode AND ROWNUM <= :limit`,
      { deptCode: departmentCode, limit },
    );
    return rows.map(r => String(r.EMPNO));
  }

  private deduplicate(events: AttendanceEvent[]): AttendanceEvent[] {
    const seen = new Set<string>();
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

  private async batchLimit(): Promise<number> {
    const { retroBatchLimit } = await this.attendanceConfig.getRuntimeConfig();
    return retroBatchLimit;
  }
}
