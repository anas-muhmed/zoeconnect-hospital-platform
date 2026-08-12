import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { AttendanceDecisionStatus, PunchDirection } from '../attendance.types';
import { AttendanceConfigService } from './attendance-config.service';

export type AttendanceProcessingStage =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'POLL_CURSOR_RESTORE'
  | 'ORACLE_POLLING'
  | 'ATTLOGS_DETECTION'
  | 'QUEUE_PUBLISH'
  | 'QUEUE_PROCESSING'
  | 'SHIFT_RESOLUTION'
  | 'LEAVE_RESOLUTION'
  | 'ATTENDANCE_DECISION'
  | 'FROMTIME_TOTIME_UPDATE'
  | 'DUTYACTUALVALUES_UPDATE'
  | 'MANUAL_OVERRIDE_DETECTION'
  | 'RETRY_LOGIC'
  | 'RECONCILIATION_JOB'
  | 'ORACLE_ERROR'
  | 'QUEUE_ERROR'
  | 'PERFORMANCE_METRICS'
  // Phase 1 — dependency event infrastructure
  | 'DEPENDENCY_ROUTING'
  | 'DEPENDENCY_STUB_HANDLER'
  // Phase 2A — dependency pollers
  | 'DEPENDENCY_POLL_DUTYPLAN'
  | 'DEPENDENCY_POLL_LEAVE'
  | 'DEPENDENCY_POLL_ORCHESTRATOR'
  // Phase 2B — global/config dependency pollers
  | 'DEPENDENCY_POLL_HOLIDAY'
  | 'DEPENDENCY_POLL_SHIFTTYPE'
  // Phase 3 — dependency-triggered recalculation
  | 'DEPENDENCY_RECALC'
  // Phase 4 — HIS reconciliation
  | 'HIS_RECONCILIATION'
  | 'HIS_DIVERGENCE'
  // Phase 5 — governance and retroactive recalculation
  | 'GOVERNANCE_CHECK'
  | 'RETROACTIVE_RECALC';

export interface AttendanceLogFields {
  employeeCode?: string | null;
  employeeId?: number | string | null;
  dutyDate?: Date | string | null;
  shiftCode?: string | null;
  attlogId?: string | null;
  punchDirection?: PunchDirection | string | null;
  punchTime?: Date | string | null;
  processingStage: AttendanceProcessingStage;
  decision?: AttendanceDecisionStatus | string | null;
  executionTimeMs?: number | null;
  success?: boolean;
  failure?: boolean;
  message?: string;
  errorCode?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AttendanceStructuredLogger implements OnModuleInit {
  private readonly logger = new Logger('AttendanceModule');

  private _debugEnabled = String(process.env['ATTENDANCE_DEBUG'] ?? 'false').toLowerCase() === 'true';
  private _debugRefreshedAt = 0;

  constructor(
    @Optional() private readonly attendanceConfig?: AttendanceConfigService,
  ) {}

  onModuleInit(): void {
    // warm the cache immediately on startup
    this.refreshDebug().catch(() => {});
  }

  debug(message: string, fields: AttendanceLogFields): void {
    if (!this.isDebugEnabled()) return;
    this.logger.debug(this.payload(message, fields));
  }

  info(message: string, fields: AttendanceLogFields): void {
    if (!this.isDebugEnabled()) return;
    this.logger.log(this.payload(message, fields));
  }

  warn(message: string, fields: AttendanceLogFields): void {
    this.logger.warn(this.payload(message, fields));
  }

  error(message: string, fields: AttendanceLogFields, error?: unknown): void {
    this.logger.error(this.payload(message, {
      ...fields,
      success: false,
      failure: true,
      errorMessage: fields.errorMessage ?? this.errorMessage(error),
    }));
  }

  time(): number {
    return Date.now();
  }

  elapsed(startedAt: number): number {
    return Date.now() - startedAt;
  }

  private isDebugEnabled(): boolean {
    // background refresh every 60s — stays sync at call sites
    const now = Date.now();
    if (this.attendanceConfig && now - this._debugRefreshedAt > 60_000) {
      this._debugRefreshedAt = now;
      this.refreshDebug().catch(() => {});
    }
    return this._debugEnabled;
  }

  private async refreshDebug(): Promise<void> {
    if (!this.attendanceConfig) return;
    try {
      const rc = await this.attendanceConfig.getRuntimeConfig();
      this._debugEnabled = rc.debug;
    } catch { /* keep previous value */ }
  }

  private payload(message: string, fields: AttendanceLogFields): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      module: 'ATTENDANCE',
      message,
      employeeCode: fields.employeeCode ?? null,
      employeeId: fields.employeeId ?? null,
      dutyDate: this.formatDate(fields.dutyDate),
      shiftCode: fields.shiftCode ?? null,
      attlogId: fields.attlogId ?? null,
      punchDirection: fields.punchDirection ?? null,
      punchTime: this.formatDateTime(fields.punchTime),
      processingStage: fields.processingStage,
      decision: fields.decision ?? null,
      executionTimeMs: fields.executionTimeMs ?? null,
      success: fields.success ?? null,
      failure: fields.failure ?? null,
      errorCode: fields.errorCode ?? null,
      errorMessage: fields.errorMessage ?? null,
      metadata: fields.metadata ?? {},
    });
  }

  private formatDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value;
  }

  private formatDateTime(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  }

  private errorMessage(error: unknown): string | null {
    if (!error) return null;
    return error instanceof Error ? error.message : String(error);
  }
}
