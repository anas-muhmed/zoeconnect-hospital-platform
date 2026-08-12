import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { QUEUE_NAMES } from '../../config/redis.config';
import { HisModule } from '../his/his.module';
import { LicensingModule } from '../licensing/license.module';
import { TenantModule } from '../platform/tenant/tenant.module';
import { RedisProvider } from '../../common/redis/redis.provider';
import { AttendanceEvent } from './entities/attendance-event.entity';
import { AttendanceAudit } from './entities/attendance-audit.entity';
import { AttendanceRule } from './entities/attendance-rule.entity';
import { AttendanceReconciliation } from './entities/attendance-reconciliation.entity';
import { AttendanceDependencyEvent } from './entities/attendance-dependency-event.entity';
import { AttendanceDependencySnapshot } from './entities/attendance-dependency-snapshot.entity';
import { AttendanceDivergenceLog } from './entities/attendance-divergence-log.entity';
import { AttendanceGovernanceLock } from './entities/attendance-governance-lock.entity';
import { AttendanceSkipLog } from './entities/attendance-skip-log.entity';
import { DependencyEventRouter } from './services/dependency-event-router.service';
import { DependencyRecalculationService } from './services/dependency-recalculation.service';
import { DependencySnapshotService } from './services/dependency-snapshot.service';
import { HisDivergenceService } from './services/his-divergence.service';
import { HisReconciliationJob } from './services/his-reconciliation.job';
import { AttendanceGovernanceService } from './services/attendance-governance.service';
import { RetroactiveRecalculationService } from './services/retroactive-recalculation.service';
import { DutyPlanDependencyPoller } from './dependency/pollers/duty-plan-dependency.poller';
import { LeaveDependencyPoller } from './dependency/pollers/leave-dependency.poller';
import { HolidayDependencyPoller } from './dependency/pollers/holiday-dependency.poller';
import { ShiftTypeDependencyPoller } from './dependency/pollers/shift-type-dependency.poller';
import { DependencyPollingOrchestrator } from './dependency/dependency-polling-orchestrator.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceHealthController, AttendanceMonitoringController } from './attendance-monitoring.controller';
import { AttendanceQueueProcessor } from './attendance.processor';
import { AttendanceConfigService } from './services/attendance-config.service';
import { AttendanceListener } from './services/attendance-listener.service';
import { AttendanceProcessor } from './services/attendance-processor.service';
import { AttendanceDecisionEngine } from './services/attendance-decision-engine.service';
import { RosterResolver } from './services/roster-resolver.service';
import { ShiftRuleEngine } from './services/shift-rule-engine.service';
import { DutyActualUpdater } from './services/duty-actual-updater.service';
import { NightReconciliationJob } from './services/night-reconciliation.job';
import { NpnlSweepService } from './services/npnl-sweep.service';
import { OraclePollingService } from './services/oracle-polling.service';
import { PunchHistoryService } from './services/punch-history.service';
import { AttendanceAuditService } from './services/attendance-audit.service';
import { RealtimeQueueService } from './services/realtime-queue.service';
import { AttendanceStructuredLogger } from './services/attendance-structured-logger.service';
import { AttendanceMonitoringService } from './services/attendance-monitoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceEvent,
      AttendanceAudit,
      AttendanceRule,
      AttendanceReconciliation,
      AttendanceDependencyEvent,
      AttendanceDependencySnapshot,
      AttendanceDivergenceLog,
      AttendanceGovernanceLock,
      AttendanceSkipLog,
    ]),
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE_REALTIME }),
    ScheduleModule.forRoot(),
    HisModule,
    LicensingModule,
    // Stage B (Checkpoint B4) — Oracle-derived tenant resolution. Attendance
    // is Pattern 2: no local Postgres join can derive tenant_id (A9's
    // relationship audit), so it must be stamped at write time from Oracle's
    // INTRABRANCHID via OracleTenantResolver, not read-side scoped like B3's
    // Pattern 1 modules.
    TenantModule,
  ],
  controllers: [AttendanceController, AttendanceMonitoringController, AttendanceHealthController],
  providers: [
    RedisProvider,
    AttendanceQueueProcessor,
    AttendanceConfigService,
    AttendanceListener,
    AttendanceProcessor,
    AttendanceDecisionEngine,
    RosterResolver,
    ShiftRuleEngine,
    DutyActualUpdater,
    NightReconciliationJob,
    NpnlSweepService,
    OraclePollingService,
    PunchHistoryService,
    AttendanceAuditService,
    RealtimeQueueService,
    AttendanceStructuredLogger,
    AttendanceMonitoringService,
    DependencyEventRouter,
    DependencyRecalculationService,
    DependencySnapshotService,
    HisDivergenceService,
    HisReconciliationJob,
    AttendanceGovernanceService,
    RetroactiveRecalculationService,
    DutyPlanDependencyPoller,
    LeaveDependencyPoller,
    HolidayDependencyPoller,
    ShiftTypeDependencyPoller,
    DependencyPollingOrchestrator,
  ],
  exports: [
    AttendanceProcessor,
    OraclePollingService,
    DependencyEventRouter,
    DependencyPollingOrchestrator,
    AttendanceGovernanceService,
    RetroactiveRecalculationService,
  ],
})
export class AttendanceModule {}
