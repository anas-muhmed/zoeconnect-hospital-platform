import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OraclePollingService } from './services/oracle-polling.service';
import { AttendanceListener } from './services/attendance-listener.service';
import { NightReconciliationJob } from './services/night-reconciliation.job';
import { NpnlSweepService } from './services/npnl-sweep.service';
import { ResetAttendanceCursorDto } from './dto/reset-attendance-cursor.dto';
import { ReconcileAttendanceDto } from './dto/reconcile-attendance.dto';
import { ReprocessAttendanceWindowDto } from './dto/reprocess-attendance.dto';

@Controller('attendance/realtime')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(
    private readonly pollingService: OraclePollingService,
    private readonly listener: AttendanceListener,
    private readonly reconciliation: NightReconciliationJob,
    private readonly npnlSweep: NpnlSweepService,
  ) {}

  @Get('cursor')
  @RequirePermissions('ATTENDANCE:REALTIME:READ')
  getCursor() {
    return this.pollingService.getCursorInfo();
  }

  @Post('cursor/reset')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async resetCursor(@Body() dto: ResetAttendanceCursorDto) {
    const fromDate = new Date(dto.fromDate);
    await this.pollingService.resetCursor(fromDate);
    return { ok: true, cursor: fromDate.toISOString() };
  }

  @Post('poll-now')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async pollNow() {
    const queued = await this.listener.tick();
    return { ok: true, queued };
  }

  @Post('reconcile')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async reconcile(@Body() dto: ReconcileAttendanceDto) {
    return this.reconciliation.reconcileWindow(new Date(dto.fromDate), new Date(dto.toDate));
  }

  // Manually triggers one NPNL early-flag sweep pass (normally runs on its
  // own timer, ATTENDANCE_NPNL_SWEEP_INTERVAL_MS). Useful for testing/ops.
  @Post('npnl-sweep')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async runNpnlSweep() {
    return this.npnlSweep.sweep();
  }

  // Revives a single FAILED/DEAD_LETTER event: resets status AND
  // attemptCount together (not just status), then re-enqueues it.
  // Resetting status alone is not sufficient — see
  // PunchHistoryService.resetForReprocessing for why.
  @Post('reprocess/:eventId')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async reprocessEvent(@Param('eventId') eventId: string) {
    return this.listener.reprocessEvent(eventId);
  }

  // Bulk-clears a FAILED/DEAD_LETTER backlog over a date window (defaults to
  // both statuses if `statuses` is omitted).
  @Post('reprocess-batch')
  @RequirePermissions('ATTENDANCE:REALTIME:MANAGE')
  async reprocessBatch(@Body() dto: ReprocessAttendanceWindowDto) {
    return this.listener.reprocessWindow(
      new Date(dto.fromDate),
      new Date(dto.toDate),
      dto.statuses,
    );
  }
}
