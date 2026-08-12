import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  AttendanceEmployeeTraceQueryDto,
  AttendanceMonitoringDateQueryDto,
  AttendanceMonitoringListQueryDto,
} from './dto/attendance-monitoring-query.dto';
import { AttendanceMonitoringService } from './services/attendance-monitoring.service';
import { AttendanceConfigService } from './services/attendance-config.service';

@Controller('attendance/monitoring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('ATTENDANCE:MONITORING:READ')
export class AttendanceMonitoringController {
  constructor(private readonly monitoring: AttendanceMonitoringService) {}

  @Get('summary')
  getSummary() {
    return this.monitoring.getSummary();
  }

  @Get('health')
  getHealth() {
    return this.monitoring.getHealth();
  }

  @Get('statistics')
  getStatistics(@Query() query: AttendanceMonitoringDateQueryDto) {
    return this.monitoring.getStatistics(query);
  }

  @Get('live-feed')
  getLiveFeed(@Query() query: AttendanceMonitoringListQueryDto) {
    return this.monitoring.getLiveFeed(query.limit);
  }

  @Get('employee/:employeeCode')
  getEmployeeTrace(
    @Param('employeeCode') employeeCode: string,
    @Query() query: AttendanceEmployeeTraceQueryDto,
  ) {
    return this.monitoring.getEmployeeTrace(employeeCode, query);
  }

  @Get('audit')
  getAudit(@Query() query: AttendanceMonitoringListQueryDto) {
    return this.monitoring.getAudit(query);
  }

  @Get('errors')
  getErrors(@Query() query: AttendanceMonitoringListQueryDto) {
    return this.monitoring.getErrors(query);
  }

  @Get('queue')
  getQueue() {
    return this.monitoring.getQueueMonitor();
  }

  @Get('oracle')
  getOracle() {
    return this.monitoring.getOracleMonitor();
  }

  @Get('reconciliation')
  getReconciliation() {
    return this.monitoring.getReconciliationMonitor();
  }

  @Get('performance')
  getPerformance() {
    return this.monitoring.getPerformanceMetrics();
  }

  @Get('debug-mode')
  getDebugMode() {
    return this.monitoring.getDebugMode();
  }
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceHealthController {
  constructor(
    private readonly monitoring: AttendanceMonitoringService,
    private readonly attendanceConfig: AttendanceConfigService,
  ) {}

  @Get('health')
  @RequirePermissions('ATTENDANCE:MONITORING:READ')
  getHealth() {
    return this.monitoring.getHealth();
  }

  /**
   * Returns whether the attendance module is enabled in the HIS config store.
   * Called by the client dashboard to decide whether to show the Attendance card.
   * Requires only JWT auth — no special permission — so any logged-in user can check.
   */
  @Get('enabled')
  async isEnabled() {
    const rc = await this.attendanceConfig.getRuntimeConfig();
    return { enabled: rc.realtimeEnabled };
  }
}
