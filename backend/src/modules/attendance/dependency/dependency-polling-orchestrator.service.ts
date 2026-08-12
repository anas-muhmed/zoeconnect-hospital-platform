/**
 * Phase 2A — DependencyPollingOrchestrator
 *
 * Drives all registered AttendanceDependencyPoller implementations on a
 * configurable interval.  Each poller is invoked independently inside its own
 * try/catch: a Leave polling failure never prevents DutyPlan from running.
 *
 * Feature flags
 * ─────────────
 *   DEPENDENCY_POLLING_ENABLED          master switch  (default: true)
 *   DEPENDENCY_POLL_INTERVAL_MS         tick cadence   (default: 60 000 ms)
 *
 * Individual poller flags are checked inside each poller's poll() method.
 *
 * Open/Closed design
 * ──────────────────
 * Adding a new dependency source (e.g. Overtime, Department Calendar) in a
 * future phase requires only:
 *   1. Implementing AttendanceDependencyPoller
 *   2. Adding the class to the pollers array below (and to AttendanceModule)
 * The orchestrator itself never needs to change.
 */

import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AttendanceConfigService } from '../services/attendance-config.service';
import { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import { LicenseService } from '../../licensing/license.service';
import { DutyPlanDependencyPoller } from './pollers/duty-plan-dependency.poller';
import { LeaveDependencyPoller } from './pollers/leave-dependency.poller';
import { HolidayDependencyPoller } from './pollers/holiday-dependency.poller';
import { ShiftTypeDependencyPoller } from './pollers/shift-type-dependency.poller';
import type { AttendanceDependencyPoller, PollerMetrics } from './interfaces/attendance-dependency-poller.interface';

export interface OrchestratorMetrics {
  enabled:      boolean;
  intervalMs:   number;
  tickCount:    number;
  lastTickAt:   Date | null;
  pollers:      Record<string, PollerMetrics>;
}

@Injectable()
export class DependencyPollingOrchestrator
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer:    NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastTickAt: Date | null = null;
  private _enabled = true;
  private _intervalMs = 60000;
  private loggedUnlicensedSkip = false;

  constructor(
    private readonly dutyPlanPoller:  DutyPlanDependencyPoller,
    private readonly leavePoller:     LeaveDependencyPoller,
    private readonly holidayPoller:   HolidayDependencyPoller,
    private readonly shiftTypePoller: ShiftTypeDependencyPoller,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    this._enabled = rc.depPollingEnabled;
    this._intervalMs = rc.depPollIntervalMs;

    if (!this._enabled) {
      this.attendanceLogger.warn('DependencyPollingOrchestrator disabled', {
        processingStage: 'STARTUP',
        success: true,
        metadata: { reason: 'depPollingEnabled=false (DEPENDENCY_POLLING_ENABLED)' },
      });
      return;
    }

    this.attendanceLogger.info('DependencyPollingOrchestrator started', {
      processingStage: 'STARTUP',
      success: true,
      metadata: {
        intervalMs: this._intervalMs,
        pollers: this.allPollers.map((p) => p.name),
      },
    });

    // Fire immediately on startup, then on each interval
    this.tick().catch(() => {});
    this.timer = setInterval(() => { this.tick().catch(() => {}); }, this._intervalMs);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.attendanceLogger.info('DependencyPollingOrchestrator stopped', {
      processingStage: 'SHUTDOWN',
      success: true,
      metadata: { tickCount: this.tickCount },
    });
  }

  // ── Tick ───────────────────────────────────────────────────────────────────

  /**
   * One orchestration tick: calls every registered poller independently.
   * Exported so tests can drive ticks directly without timers.
   */
  async tick(): Promise<void> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — DutyPlan dependency poll tick paused.', {
          processingStage: 'DEPENDENCY_POLL_ORCHESTRATOR',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    this.tickCount++;
    this.lastTickAt = new Date();
    const startedAt = this.attendanceLogger.time();

    for (const poller of this.allPollers) {
      try {
        await poller.poll();
      } catch (err) {
        // Each poller's poll() is already non-throwing; this guard is a safety net.
        this.attendanceLogger.error(`DependencyPoller ${poller.name} threw unexpectedly`, {
          processingStage: 'DEPENDENCY_POLL_ORCHESTRATOR',
          success: false,
          failure: true,
          errorMessage: (err as Error).message,
          metadata: { pollerName: poller.name },
        }, err);
      }
    }

    this.attendanceLogger.info('Dependency polling tick completed', {
      processingStage: 'DEPENDENCY_POLL_ORCHESTRATOR',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { tickCount: this.tickCount, pollers: this.allPollers.length },
    });
  }

  // ── Metrics ────────────────────────────────────────────────────────────────

  getMetrics(): OrchestratorMetrics {
    const pollers: Record<string, PollerMetrics> = {};
    for (const p of this.allPollers) {
      pollers[p.name] = p.getMetrics();
    }
    return {
      enabled:    this._enabled,
      intervalMs: this._intervalMs,
      tickCount:  this.tickCount,
      lastTickAt: this.lastTickAt,
      pollers,
    };
  }

  // ── Cursor reset helpers (for admin endpoints) ────────────────────────────

  async resetDutyPlanCursor(date: Date): Promise<void> {
    await this.dutyPlanPoller.resetCursor(date);
  }

  async resetLeaveCursor(date: Date): Promise<void> {
    await this.leavePoller.resetCursor(date);
  }

  async resetHolidayCursor(date: Date): Promise<void> {
    await this.holidayPoller.resetCursor(date);
  }

  async resetShiftTypeCursor(date: Date): Promise<void> {
    await this.shiftTypePoller.resetCursor(date);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private get allPollers(): AttendanceDependencyPoller[] {
    return [
      this.dutyPlanPoller,
      this.leavePoller,
      this.holidayPoller,
      this.shiftTypePoller,
    ];
  }

}
