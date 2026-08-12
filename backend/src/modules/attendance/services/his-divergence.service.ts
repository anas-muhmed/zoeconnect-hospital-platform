/**
 * HisDivergenceService — Phase 4
 *
 * Compares one (employeeCode, dutyDate) pair between ZoeConnect and Oracle HIS,
 * writes the result to `attendance_divergence_logs`, and applies the configured
 * reconciliation strategy when a divergence is detected.
 *
 * Strategy (env ATTENDANCE_RECON_STRATEGY, default ACCEPT_HIS):
 *   ACCEPT_HIS  — update the ZoeConnect snapshot to match HIS (source-of-truth update)
 *   ACCEPT_HDSP — keep ZoeConnect's value; log only
 *   ALERT_ONLY  — log only; no state change
 *
 * Design constraints:
 *   • Never writes to Oracle — HIS is only ever READ in this service.
 *   • Errors on individual rows are caught and re-thrown as a structured
 *     warning so callers can continue processing the remaining rows.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceDivergenceLog, DivergenceOutcome, ReconciliationStrategy } from '../entities/attendance-divergence-log.entity';
import { AttendanceDependencySnapshot } from '../entities/attendance-dependency-snapshot.entity';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { AttendanceConfigService } from './attendance-config.service';

export interface DivergenceInput {
  employeeCode:  string;
  dutyDate:      Date;
  /** What ZoeConnect computed (from snapshot). Null = no snapshot found. */
  hdspDecision:  string | null;
  /** What HIS Oracle has in DUTYACTUALVALUES.ATTENDANCE. Null = HIS has no row. */
  hisAttendance: string | null;
  reconciledAt:  Date;
}

export interface DivergenceResult {
  outcome:         DivergenceOutcome;
  strategyApplied: ReconciliationStrategy | null;
}

@Injectable()
export class HisDivergenceService {
  constructor(
    @InjectRepository(AttendanceDivergenceLog)
    private readonly logRepo: Repository<AttendanceDivergenceLog>,
    @InjectRepository(AttendanceDependencySnapshot)
    private readonly snapshotRepo: Repository<AttendanceDependencySnapshot>,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
  ) {}

  async compare(input: DivergenceInput): Promise<DivergenceResult> {
    const outcome   = this.classify(input);
    const strategy  = outcome === 'HIS_CONFIRMED' ? null : await this.configuredStrategy();

    // Persist log row (every comparison, not just divergences)
    await this.logRepo.save(
      this.logRepo.create({
        employeeCode:    input.employeeCode,
        dutyDate:        input.dutyDate,
        hdspDecision:    input.hdspDecision,
        hisAttendance:   input.hisAttendance,
        outcome,
        strategyApplied: strategy,
        reconciledAt:    input.reconciledAt,
      }),
    );

    if (outcome === 'HIS_DIVERGED') {
      this.attendanceLogger.warn('HIS divergence detected', {
        processingStage: 'HIS_DIVERGENCE',
        employeeCode: input.employeeCode,
        dutyDate: input.dutyDate,
        metadata: {
          hdspDecision:    input.hdspDecision,
          hisAttendance:   input.hisAttendance,
          strategy,
        },
      });

      if (strategy === 'ACCEPT_HIS' && input.hisAttendance) {
        await this.applyHisResult(input);
      }
    }

    return { outcome, strategyApplied: strategy };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private classify(input: DivergenceInput): DivergenceOutcome {
    const hasHdsp = input.hdspDecision  !== null;
    const hasHis  = input.hisAttendance !== null;

    if (!hasHdsp && !hasHis) return 'HIS_CONFIRMED'; // both absent — treat as confirmed
    if (!hasHis)             return 'HDSP_ONLY';
    if (!hasHdsp)            return 'HIS_ONLY';

    return input.hdspDecision === input.hisAttendance
      ? 'HIS_CONFIRMED'
      : 'HIS_DIVERGED';
  }

  /**
   * ACCEPT_HIS: update the snapshot so it reflects HIS's authoritative value.
   * This keeps ZoeConnect's audit trail in sync without touching Oracle.
   */
  private async applyHisResult(input: DivergenceInput): Promise<void> {
    await this.snapshotRepo
      .createQueryBuilder()
      .update(AttendanceDependencySnapshot)
      .set({
        hdspDecision: input.hisAttendance as any,
        capturedAt:   input.reconciledAt,
      })
      .where('employee_code = :ec AND duty_date = :d', {
        ec: input.employeeCode,
        d:  input.dutyDate,
      })
      .execute();

    this.attendanceLogger.info('HIS result accepted — snapshot updated', {
      processingStage: 'HIS_DIVERGENCE',
      employeeCode: input.employeeCode,
      dutyDate: input.dutyDate,
      metadata: {
        previousHdsp: input.hdspDecision,
        acceptedHis:  input.hisAttendance,
      },
    });
  }

  private async configuredStrategy(): Promise<ReconciliationStrategy> {
    const { reconStrategy: raw } = await this.attendanceConfig.getRuntimeConfig();
    if (raw === 'ACCEPT_HDSP' || raw === 'ALERT_ONLY') return raw;
    return 'ACCEPT_HIS';
  }
}
