/**
 * AttendanceGovernanceService — Phase 5
 *
 * Central gate that prevents automatic recalculation from overwriting
 * finalized (payroll-locked or manually-corrected) attendance records.
 *
 * Hierarchy of lock checks (most-specific first):
 *   1. EMPLOYEE  — lock on exactly this employee for this date range
 *   2. DEPARTMENT — lock on this employee's department for this date range
 *   3. ALL       — blanket freeze covering all employees for this date range
 *
 * Public API:
 *   canWrite(employeeCode, dutyDate, mode)    → GovernanceDecision
 *   lockEmployee(...)                         → AttendanceGovernanceLock
 *   lockDepartment(...)                       → AttendanceGovernanceLock
 *   lockAll(...)                              → AttendanceGovernanceLock
 *   unlock(lockId, unlockedBy)               → void
 *   recordSkip(input)                        → void  (best-effort, never throws)
 *   getActiveLocks()                          → AttendanceGovernanceLock[]
 *   getSkipSummary(since)                     → Record<SkipReason, number>
 *
 * The service never writes to Oracle and never throws externally — all
 * errors are caught and logged so a governance failure can't crash the
 * processing pipeline.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AttendanceGovernanceLock } from '../entities/attendance-governance-lock.entity';
import { AttendanceSkipLog } from '../entities/attendance-skip-log.entity';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttendanceProcessingMode, LockScope, SkipReason } from '../attendance.types';

export interface GovernanceDecision {
  allowed: boolean;
  reason: SkipReason | null;
  lockId: string | null;
}

export interface LockInput {
  employeeCode?: string;
  departmentCode?: string;
  periodFrom: Date;
  periodTo: Date;
  lockedBy: string;
  reason?: string;
}

export interface SkipLogInput {
  employeeCode: string;
  dutyDate: Date;
  skipReason: SkipReason;
  mode: AttendanceProcessingMode;
  attendanceEventId?: string | null;
  dependencyEventId?: string | null;
  metadata?: Record<string, unknown>;
  // Stage B (Checkpoint B4) — the same Oracle INTRABRANCHID RosterResolver
  // already resolved for this event, threaded through so recordSkip() can
  // stamp tenant_id without a second Oracle round-trip. Optional because
  // AttendanceGovernanceLock's lock-management methods (lockEmployee/
  // lockDepartment/lockAll/unlock) are unreachable from any controller
  // today — see the B4 pre-flight note — so no live call site loses
  // anything by this being optional.
  intraBranchId?: number | null;
}

@Injectable()
export class AttendanceGovernanceService {
  constructor(
    @InjectRepository(AttendanceGovernanceLock)
    private readonly lockRepo: Repository<AttendanceGovernanceLock>,
    @InjectRepository(AttendanceSkipLog)
    private readonly skipRepo: Repository<AttendanceSkipLog>,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly oracleTenantResolver: OracleTenantResolver,
  ) {}

  /**
   * Main governance gate.
   *
   * Returns { allowed: true } if no active lock covers (employeeCode, dutyDate).
   * Returns { allowed: false, reason: 'PAYROLL_LOCKED', lockId } if a lock matches.
   *
   * REALTIME mode is NOT exempt — a payroll lock should block even live punches
   * from overwriting a finalised record. The processor logs a warning and skips
   * the write while still marking the event as SKIPPED (not FAILED).
   *
   * Best-effort: if the DB check itself errors, logs a warning and returns
   * { allowed: true } to avoid silently blocking all processing.
   */
  async canWrite(
    employeeCode: string,
    dutyDate: Date,
    mode: AttendanceProcessingMode,
  ): Promise<GovernanceDecision> {
    try {
      const dutyDateStr = this.toDateStr(dutyDate);

      // Check EMPLOYEE lock
      const employeeLock = await this.lockRepo.findOne({
        where: {
          scope: 'EMPLOYEE',
          employeeCode,
          isActive: true,
          periodFrom: LessThanOrEqual(new Date(dutyDateStr)),
          periodTo: MoreThanOrEqual(new Date(dutyDateStr)),
        },
      });
      if (employeeLock) {
        return { allowed: false, reason: 'PAYROLL_LOCKED', lockId: employeeLock.id };
      }

      // Check ALL lock (no employeeCode/deptCode filter)
      const allLock = await this.lockRepo.findOne({
        where: {
          scope: 'ALL',
          isActive: true,
          periodFrom: LessThanOrEqual(new Date(dutyDateStr)),
          periodTo: MoreThanOrEqual(new Date(dutyDateStr)),
        },
      });
      if (allLock) {
        return { allowed: false, reason: 'PAYROLL_LOCKED', lockId: allLock.id };
      }

      // DEPARTMENT lock check: requires knowing the employee's dept code.
      // The caller can pass departmentCode via metadata if available.
      // The raw canWrite() call from the processor doesn't have dept info,
      // so DEPARTMENT locks must be resolved by the retroactive service which
      // knows the employee list per dept at query time.
      // This is intentional: the processor is a generic per-event gate.

      return { allowed: true, reason: null, lockId: null };
    } catch (err) {
      this.attendanceLogger.warn('GovernanceService.canWrite threw — defaulting to allowed', {
        processingStage: 'GOVERNANCE_CHECK',
        employeeCode,
        metadata: { mode, dutyDate: dutyDate?.toISOString?.() ?? String(dutyDate), err: (err as Error).message },
      });
      return { allowed: true, reason: null, lockId: null };
    }
  }

  /**
   * Checks an explicit DEPARTMENT lock for a known departmentCode.
   * Called by RetroactiveRecalculationService which has dept context.
   */
  async isDepartmentLocked(departmentCode: string, dutyDate: Date): Promise<AttendanceGovernanceLock | null> {
    try {
      const dutyDateStr = this.toDateStr(dutyDate);
      return this.lockRepo.findOne({
        where: {
          scope: 'DEPARTMENT',
          departmentCode,
          isActive: true,
          periodFrom: LessThanOrEqual(new Date(dutyDateStr)),
          periodTo: MoreThanOrEqual(new Date(dutyDateStr)),
        },
      });
    } catch {
      return null;
    }
  }

  // ── Lock management ────────────────────────────────────────────────────────

  async lockEmployee(input: LockInput): Promise<AttendanceGovernanceLock> {
    return this.createLock('EMPLOYEE', input);
  }

  async lockDepartment(input: LockInput): Promise<AttendanceGovernanceLock> {
    return this.createLock('DEPARTMENT', input);
  }

  async lockAll(input: LockInput): Promise<AttendanceGovernanceLock> {
    return this.createLock('ALL', input);
  }

  async unlock(lockId: string, unlockedBy: string): Promise<void> {
    await this.lockRepo.update({ id: lockId }, { isActive: false });
    this.attendanceLogger.info('Governance lock deactivated', {
      processingStage: 'GOVERNANCE_CHECK',
      metadata: { lockId, unlockedBy },
    });
  }

  // ── Skip log ────────────────────────────────────────────────────────────────

  /**
   * Records a skipped recalculation in attendance_skip_logs.
   * Best-effort: never throws.
   */
  async recordSkip(input: SkipLogInput): Promise<void> {
    try {
      const tenantId = await this.oracleTenantResolver.resolveForBranch(input.intraBranchId ?? null);
      const entry = this.skipRepo.create({
        employeeCode:      input.employeeCode,
        dutyDate:          input.dutyDate,
        skipReason:        input.skipReason,
        mode:              input.mode,
        attendanceEventId: input.attendanceEventId ?? null,
        dependencyEventId: input.dependencyEventId ?? null,
        skippedAt:         new Date(),
        metadata:          input.metadata ?? null,
        tenantId,
      });
      await this.skipRepo.save(entry);
    } catch (err) {
      this.attendanceLogger.warn('GovernanceService.recordSkip failed (non-fatal)', {
        processingStage: 'GOVERNANCE_CHECK',
        employeeCode: input.employeeCode,
        metadata: { skipReason: input.skipReason, err: (err as Error).message },
      });
    }
  }

  // ── Monitoring ─────────────────────────────────────────────────────────────

  async getActiveLocks(): Promise<AttendanceGovernanceLock[]> {
    try {
      return this.lockRepo.find({ where: { isActive: true }, order: { lockedAt: 'DESC' } });
    } catch {
      return [];
    }
  }

  async getSkipSummary(since: Date): Promise<Record<string, number>> {
    try {
      const rows = await this.skipRepo
        .createQueryBuilder('sl')
        .select('sl.skip_reason', 'reason')
        .addSelect('COUNT(*)', 'count')
        .where('sl.skipped_at >= :since', { since })
        .groupBy('sl.skip_reason')
        .getRawMany<{ reason: string; count: string }>();

      const summary: Record<string, number> = {};
      for (const row of rows) {
        summary[row.reason] = parseInt(row.count, 10);
      }
      return summary;
    } catch {
      return {};
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async createLock(scope: LockScope, input: LockInput): Promise<AttendanceGovernanceLock> {
    const lock = this.lockRepo.create({
      scope,
      employeeCode:   input.employeeCode   ?? null,
      departmentCode: input.departmentCode ?? null,
      periodFrom:     input.periodFrom,
      periodTo:       input.periodTo,
      lockedBy:       input.lockedBy,
      lockedAt:       new Date(),
      reason:         input.reason ?? null,
      isActive:       true,
    });
    const saved = await this.lockRepo.save(lock);
    this.attendanceLogger.info('Governance lock created', {
      processingStage: 'GOVERNANCE_CHECK',
      employeeCode: input.employeeCode ?? null,
      metadata: {
        lockId:   saved.id,
        scope,
        periodFrom: input.periodFrom.toISOString().slice(0, 10),
        periodTo:   input.periodTo.toISOString().slice(0, 10),
        lockedBy: input.lockedBy,
      },
    });
    return saved;
  }

  private toDateStr(d: Date): string {
    return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  }
}
