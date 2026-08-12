/**
 * DependencySnapshotService — Phase 4
 *
 * Upserts one row per (employeeCode, dutyDate) into `attendance_dependency_snapshots`
 * every time the AttendanceProcessor successfully evaluates a decision.
 *
 * The snapshot records ZoeConnect's last computed decision so that HisReconciliationJob
 * can compare it against Oracle DUTYACTUALVALUES at 03:30 and detect divergences.
 *
 * Idempotent: repeated calls for the same (employeeCode, dutyDate) overwrite
 * the previous row — the UNIQUE constraint on those columns ensures at most one
 * live snapshot per employee-date pair.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceDependencySnapshot } from '../entities/attendance-dependency-snapshot.entity';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttendanceDecisionStatus, AttendanceProcessingMode } from '../attendance.types';

export interface SnapshotInput {
  employeeCode: string;
  dutyDate:     Date;
  hdspDecision: AttendanceDecisionStatus;
  shiftCode:    string | null;
  mode:         AttendanceProcessingMode;
  // Stage B (Checkpoint B4) — same Oracle INTRABRANCHID threading pattern as
  // SkipLogInput; optional so findForDate()'s read path and any other
  // future caller isn't forced to supply it.
  intraBranchId?: number | null;
}

@Injectable()
export class DependencySnapshotService {
  constructor(
    @InjectRepository(AttendanceDependencySnapshot)
    private readonly snapshotRepo: Repository<AttendanceDependencySnapshot>,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly oracleTenantResolver: OracleTenantResolver,
  ) {}

  /**
   * Upserts the snapshot for (employeeCode, dutyDate).
   *
   * Uses PostgreSQL ON CONFLICT DO UPDATE so the operation is atomic and
   * safe under concurrent processing of the same employee-date pair.
   *
   * Errors are caught and logged — a snapshot failure must never propagate
   * to the caller and block attendance processing.
   */
  async capture(input: SnapshotInput): Promise<void> {
    try {
      const now = new Date();
      const tenantId = await this.oracleTenantResolver.resolveForBranch(input.intraBranchId ?? null);
      await this.snapshotRepo
        .createQueryBuilder()
        .insert()
        .into(AttendanceDependencySnapshot)
        .values({
          employeeCode:   input.employeeCode,
          dutyDate:       input.dutyDate,
          hdspDecision:   input.hdspDecision,
          shiftCode:      input.shiftCode,
          processingMode: input.mode,
          capturedAt:     now,
          tenantId,
        })
        .orUpdate(
          // Deliberately NOT including tenant_id here: on conflict (same
          // employee_code + duty_date), the existing tenant_id is left
          // untouched rather than re-stamped on every re-evaluation. Once a
          // real branch->tenant mapping exists (Phase 10), an employee's
          // tenant cannot legitimately change between re-evaluations of the
          // same duty date, so preserving the original value is correct and
          // also avoids a redundant write.
          ['hdsp_decision', 'shift_code', 'processing_mode', 'captured_at', 'updated_at'],
          ['employee_code', 'duty_date'],
          { skipUpdateIfNoValuesChanged: false },
        )
        .execute();
    } catch (err) {
      // Non-fatal: snapshot is best-effort; attendance decisions must still land
      this.attendanceLogger.warn('DependencySnapshot capture failed (non-fatal)', {
        processingStage: 'HIS_RECONCILIATION',
        employeeCode: input.employeeCode,
        dutyDate: input.dutyDate,
        metadata: { mode: input.mode, error: (err as Error).message },
      });
    }
  }

  /**
   * Retrieves snapshots for a batch of (employeeCode, dutyDate) pairs.
   * Used by HisReconciliationJob to look up ZoeConnect decisions in bulk.
   */
  async findForDate(dutyDate: Date): Promise<AttendanceDependencySnapshot[]> {
    const { from, to } = this.dayBounds(dutyDate);
    return this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.dutyDate >= :from AND s.dutyDate <= :to', { from, to })
      .getMany();
  }

  private dayBounds(dutyDate: Date): { from: Date; to: Date } {
    const dateStr = dutyDate instanceof Date
      ? dutyDate.toISOString().slice(0, 10)
      : String(dutyDate).slice(0, 10);
    return {
      from: new Date(`${dateStr}T00:00:00.000Z`),
      to:   new Date(`${dateStr}T23:59:59.999Z`),
    };
  }
}
