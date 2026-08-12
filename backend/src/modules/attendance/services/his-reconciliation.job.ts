/**
 * HisReconciliationJob — Phase 4
 *
 * Runs at 03:30 every day (after HIS batch processing closes at ~03:00) and
 * compares ZoeConnect's computed attendance decisions against Oracle DUTYACTUALVALUES
 * for the previous calendar day.
 *
 * For each employee-date pair, it:
 *   1. Reads the HIS Oracle value (ATTENDANCE column from DUTYACTUALVALUES).
 *   2. Looks up ZoeConnect's snapshot (written by DependencySnapshotService after each
 *      successful AttendanceProcessor run).
 *   3. Delegates comparison and strategy application to HisDivergenceService.
 *
 * Configuration:
 *   HIS_RECON_CRON           — cron expression (default: '0 30 3 * * *' = 03:30)
 *   HIS_RECON_ENABLED        — set to 'false' to disable (default: enabled)
 *   HIS_RECON_LOOKBACK_DAYS  — how many days back to reconcile (default: 1)
 *   HIS_RECON_BATCH_SIZE     — max Oracle rows per run (default: 10000)
 *
 * Design constraints:
 *   • Never writes to Oracle — only reads from DUTYACTUALVALUES.
 *   • Errors on individual rows are caught; the job continues with remaining rows.
 *   • The job is idempotent: running twice for the same date produces duplicate
 *     log rows but does not double-apply strategy updates (second ACCEPT_HIS
 *     sets the same value again → no-op).
 */

import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../../platform/infrastructure/tokens';
import { AttendanceConfigService } from './attendance-config.service';
import { DependencySnapshotService } from './dependency-snapshot.service';
import { HisDivergenceService } from './his-divergence.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { LicenseService } from '../../licensing/license.service';
import type { AttendanceDependencySnapshot } from '../entities/attendance-dependency-snapshot.entity';

interface HisActualRow {
  employeeCode: string;
  attendance:   string;
}

@Injectable()
export class HisReconciliationJob {
  private loggedUnlicensedSkip = false;

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly snapshotService:  DependencySnapshotService,
    private readonly divergenceService: HisDivergenceService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly licenseService:   LicenseService,
  ) {}

  @Cron(process.env['HIS_RECON_CRON'] ?? '0 30 3 * * *')
  async reconcileYesterday(): Promise<void> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — nightly HIS reconciliation cron paused.', {
          processingStage: 'HIS_RECONCILIATION',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    const { hisReconLookbackDays } = await this.attendanceConfig.getRuntimeConfig();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - hisReconLookbackDays);
    yesterday.setHours(0, 0, 0, 0);

    await this.reconcileDate(yesterday);
  }

  /**
   * Reconciles a specific calendar date. Public so it can be called from tests
   * or an admin endpoint without waiting for the cron.
   */
  async reconcileDate(dutyDate: Date): Promise<ReconciliationSummary> {
    const { hisReconEnabled } = await this.attendanceConfig.getRuntimeConfig();
    if (!hisReconEnabled) {
      this.attendanceLogger.info('HisReconciliationJob disabled', {
        processingStage: 'HIS_RECONCILIATION',
        success: true,
        metadata: { reason: 'HIS_RECON_ENABLED=false' },
      });
      return this.emptySummary(dutyDate);
    }

    const startedAt = this.attendanceLogger.time();
    const reconciledAt = new Date();
    const dateStr = dutyDate.toISOString().slice(0, 10);

    this.attendanceLogger.info('HisReconciliation started', {
      processingStage: 'HIS_RECONCILIATION',
      success: true,
      metadata: { date: dateStr },
    });

    const summary: ReconciliationSummary = {
      date: dateStr,
      hisRows: 0,
      hdspSnapshots: 0,
      confirmed: 0,
      diverged: 0,
      hdspOnly: 0,
      hisOnly: 0,
      errors: 0,
    };

    try {
      // 1. Fetch HIS Oracle rows for the date
      const hisRows = await this.fetchHisActuals(dutyDate);
      summary.hisRows = hisRows.length;

      // 2. Fetch ZoeConnect snapshots for the same date (keyed by employeeCode)
      const snapshots = await this.snapshotService.findForDate(dutyDate);
      summary.hdspSnapshots = snapshots.length;

      const snapshotMap = new Map<string, AttendanceDependencySnapshot>(
        snapshots.map((s) => [s.employeeCode, s]),
      );
      const hisEmployeeCodes = new Set<string>();

      // 3. Compare HIS rows against snapshots
      for (const hisRow of hisRows) {
        hisEmployeeCodes.add(hisRow.employeeCode);
        const snapshot = snapshotMap.get(hisRow.employeeCode) ?? null;

        try {
          const result = await this.divergenceService.compare({
            employeeCode:  hisRow.employeeCode,
            dutyDate,
            hdspDecision:  snapshot?.hdspDecision ?? null,
            hisAttendance: hisRow.attendance,
            reconciledAt,
          });

          switch (result.outcome) {
            case 'HIS_CONFIRMED': summary.confirmed++; break;
            case 'HIS_DIVERGED':  summary.diverged++;  break;
            case 'HIS_ONLY':      summary.hisOnly++;   break;
            default:              break;
          }
        } catch {
          summary.errors++;
          this.attendanceLogger.warn('HisReconciliation row comparison failed — continuing', {
            processingStage: 'HIS_RECONCILIATION',
            employeeCode: hisRow.employeeCode,
            metadata: { date: dateStr },
          });
        }
      }

      // 4. Check for ZoeConnect-only rows (snapshots with no HIS counterpart)
      for (const snapshot of snapshots) {
        if (!hisEmployeeCodes.has(snapshot.employeeCode)) {
          summary.hdspOnly++;
          try {
            await this.divergenceService.compare({
              employeeCode:  snapshot.employeeCode,
              dutyDate,
              hdspDecision:  snapshot.hdspDecision,
              hisAttendance: null,
              reconciledAt,
            });
          } catch {
            summary.errors++;
          }
        }
      }

      this.attendanceLogger.info('HisReconciliation completed', {
        processingStage: 'HIS_RECONCILIATION',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { ...summary },
      });
    } catch (err) {
      this.attendanceLogger.error('HisReconciliation failed', {
        processingStage: 'HIS_RECONCILIATION',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        metadata: { date: dateStr },
      }, err);
    }

    return summary;
  }

  // ── Oracle query ───────────────────────────────────────────────────────────

  private async fetchHisActuals(dutyDate: Date): Promise<HisActualRow[]> {
    const cfg = await this.attendanceConfig.getConfig();

    const actualTable  = this.attendanceConfig.ident(cfg, 'attendance.actual.table');
    const empTable     = this.attendanceConfig.ident(cfg, 'attendance.employee.table');
    const empId        = this.attendanceConfig.ident(cfg, 'attendance.actual.employeeId');
    const empFk        = this.attendanceConfig.ident(cfg, 'attendance.employee.id');
    const empCode      = this.attendanceConfig.ident(cfg, 'attendance.employee.code');
    const dateCol      = this.attendanceConfig.ident(cfg, 'attendance.actual.dutyDate');
    const statusCol    = this.attendanceConfig.ident(cfg, 'attendance.actual.status');

    const { hisReconBatchSize: limit } = await this.attendanceConfig.getRuntimeConfig();
    const dateStr = dutyDate.toISOString().slice(0, 10);

    const sql = `
      SELECT e.${empCode} AS "employeeCode",
             a.${statusCol} AS "attendance"
      FROM   ${actualTable} a
      JOIN   ${empTable} e ON e.${empFk} = a.${empId}
      WHERE  a.${dateCol} = TO_DATE(:dateStr, 'YYYY-MM-DD')
      AND    ROWNUM <= :limit
    `;

    const rows = await this.oracle.query<{ employeeCode: string; attendance: string }>(
      sql,
      { dateStr, limit },
    );

    return rows.map((r) => ({
      employeeCode: String(r.employeeCode ?? '').trim(),
      attendance:   String(r.attendance   ?? '').trim(),
    })).filter((r) => r.employeeCode.length > 0);
  }

  private emptySummary(dutyDate: Date): ReconciliationSummary {
    return {
      date: dutyDate.toISOString().slice(0, 10),
      hisRows: 0, hdspSnapshots: 0,
      confirmed: 0, diverged: 0,
      hdspOnly: 0, hisOnly: 0,
      errors: 0,
    };
  }
}

export interface ReconciliationSummary {
  date:          string;
  hisRows:       number;
  hdspSnapshots: number;
  confirmed:     number;
  diverged:      number;
  hdspOnly:      number;
  hisOnly:       number;
  errors:        number;
}
