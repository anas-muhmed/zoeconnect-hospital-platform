import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { Between, ObjectLiteral, Repository } from 'typeorm';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { OraclePoolService } from '../../his/oracle-pool.service';
import { AttendanceAudit } from '../entities/attendance-audit.entity';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { AttendanceReconciliation } from '../entities/attendance-reconciliation.entity';
import { AttendanceGovernanceLock } from '../entities/attendance-governance-lock.entity';
import { AttendanceSkipLog } from '../entities/attendance-skip-log.entity';
import type { Redis } from 'ioredis';
import { DependencyPollingOrchestrator } from '../dependency/dependency-polling-orchestrator.service';
import { AttendanceConfigService } from './attendance-config.service';

type ComponentStatus = 'Healthy' | 'Warning' | 'Failed';

const CURSOR_KEY = 'attendance:attlogs:cursor';

@Injectable()
export class AttendanceMonitoringService {
  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    @InjectRepository(AttendanceAudit)
    private readonly auditRepo: Repository<AttendanceAudit>,
    @InjectRepository(AttendanceReconciliation)
    private readonly reconciliationRepo: Repository<AttendanceReconciliation>,
    @InjectQueue(QUEUE_NAMES.ATTENDANCE_REALTIME)
    private readonly attendanceQueue: Queue,
    @InjectRedis()
    private readonly redis: Redis,
    private readonly oracle: OraclePoolService,
    @Optional() private readonly dependencyOrchestrator?: DependencyPollingOrchestrator,
    @Optional() @InjectRepository(AttendanceGovernanceLock)
    private readonly lockRepo?: Repository<AttendanceGovernanceLock>,
    @Optional() @InjectRepository(AttendanceSkipLog)
    private readonly skipLogRepo?: Repository<AttendanceSkipLog>,
    @Optional() private readonly attendanceConfig?: AttendanceConfigService,
  ) {}

  async getSummary() {
    const [oracle, redis, queue, statistics, reconciliation, cursor] = await Promise.all([
      this.getOracleMonitor(),
      this.getRedisStatus(),
      this.getQueueMonitor(),
      this.getStatistics({}),
      this.getReconciliationMonitor(),
      this.getCursorPosition(),
    ]);
    const latestEvent = await this.findLatest(this.eventRepo, { updatedAt: 'DESC' });
    const latestAudit = await this.findLatest(this.auditRepo, { createdAt: 'DESC' });

    const cards = [
      this.card('Realtime Status', this.statusFromLatestEvent(latestEvent), latestEvent?.updatedAt ?? null, null),
      this.card('Oracle Connection', oracle.oracleStatus, oracle.lastOraclePollTime, oracle.averagePollTime),
      this.card('Redis Queue', queue.queueStatus, new Date(), queue.averageProcessingTime),
      this.card('Polling Service', oracle.currentPollStatus, oracle.lastOraclePollTime, oracle.averagePollTime),
      this.card('Attendance Engine', latestEvent?.status === 'FAILED' || latestEvent?.status === 'DEAD_LETTER' ? 'Warning' : 'Healthy', latestEvent?.processedAt ?? latestEvent?.updatedAt ?? null, null),
      this.card('Reconciliation Service', reconciliation.status, reconciliation.lastReconciliation, reconciliation.duration),
    ];

    return {
      cards,
      oracle,
      redis,
      queue,
      statistics,
      reconciliation,
      lastAuditAt: latestAudit?.createdAt ?? null,
      cursorPosition: cursor,
      dependencyPollers: this.dependencyOrchestrator?.getMetrics() ?? null,
      governance: await this.getGovernanceMetrics(),
      unavailableNotes: this.unavailableNotes(),
    };
  }

  async getHealth() {
    const [oracle, redis, queue, cursor] = await Promise.all([
      this.getOracleMonitor(),
      this.getRedisStatus(),
      this.getQueueMonitor(),
      this.getCursorPosition(),
    ]);
    const reconciliation = await this.getReconciliationMonitor();
    const latestEvent = await this.findLatest(this.eventRepo, { updatedAt: 'DESC' });
    return {
      oracleStatus: oracle.oracleStatus,
      redisStatus: redis.status,
      pollingStatus: oracle.currentPollStatus,
      queueStatus: queue.queueStatus,
      attendanceEngineStatus: this.statusFromLatestEvent(latestEvent),
      reconciliationStatus: reconciliation.status,
      cursorPosition: cursor,
      averageLatency: queue.averageProcessingTime,
      pendingJobs: queue.jobsWaiting + queue.jobsActive,
    };
  }

  async getOracleMonitor() {
    const cursor = await this.getCursorPosition();
    const latestEvent = await this.findLatest(this.eventRepo, { createdAt: 'DESC' });
    const today = this.todayRange();
    const pollsToday = await this.eventRepo.count({ where: { createdAt: Between(today.from, today.to) } });
    const errorsToday = await this.eventRepo.count({
      where: [
        { status: 'FAILED', updatedAt: Between(today.from, today.to) },
        { status: 'DEAD_LETTER', updatedAt: Between(today.from, today.to) },
      ],
    });
    const latestFailed = await this.eventRepo.findOne({
      where: [{ status: 'FAILED' }, { status: 'DEAD_LETTER' }],
      order: { updatedAt: 'DESC' },
    });

    const rc = await this.attendanceConfig?.getRuntimeConfig();
    const currentPollStatus: ComponentStatus = rc && !rc.realtimeEnabled
      ? 'Warning'
      : latestFailed?.updatedAt && Date.now() - latestFailed.updatedAt.getTime() < 5 * 60_000
        ? 'Warning'
        : 'Healthy';

    return {
      oracleStatus: (this.oracle.isAvailable ? 'Healthy' : 'Failed') as ComponentStatus,
      currentPollCursor: cursor,
      lastOraclePollTime: latestEvent?.createdAt ?? null,
      lastAttlogIdProcessed: latestEvent?.sourceId ?? null,
      pollInterval: rc?.pollIntervalMs ?? this.numberEnv('ATTENDANCE_POLL_INTERVAL_MS', 1500),
      averagePollTime: this.notAvailable('Poll duration is only emitted to logs and is not persisted.'),
      numberOfPollsToday: pollsToday,
      numberOfOracleErrors: errorsToday,
      currentPollStatus,
    };
  }

  async getQueueMonitor() {
    const counts = await this.safeQueueCounts();
    const failedJobs = await this.safeFailedJobs();
    const retryCount = failedJobs.reduce((sum, job) => sum + (job.attemptsMade ?? 0), 0);
    const deadLetterCount = await this.eventRepo.count({ where: { status: 'DEAD_LETTER' } });
    const averageProcessingTime = await this.averageEventProcessingMs();

    return {
      queueStatus: (counts ? (counts.failed > 0 ? 'Warning' : 'Healthy') : 'Failed') as ComponentStatus,
      jobsWaiting: counts?.waiting ?? 0,
      jobsActive: counts?.active ?? 0,
      jobsCompleted: counts?.completed ?? 0,
      jobsFailed: counts?.failed ?? 0,
      retryCount,
      deadLetterQueueCount: deadLetterCount,
      averageProcessingTime,
    };
  }

  async getStatistics(query: { date?: string }) {
    const range = this.dayRange(query.date);
    const grouped = await this.eventRepo
      .createQueryBuilder('event')
      .select('event.decisionStatus', 'decision')
      .addSelect('event.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('event.logDateTime BETWEEN :from AND :to', range)
      .groupBy('event.decisionStatus')
      .addGroupBy('event.status')
      .getRawMany<{ decision: string | null; status: string; count: string }>();

    const decisionCount = (names: string[]) =>
      grouped
        .filter((row) => row.decision && names.includes(row.decision))
        .reduce((sum, row) => sum + Number(row.count), 0);
    const statusCount = (names: string[]) =>
      grouped
        .filter((row) => names.includes(row.status))
        .reduce((sum, row) => sum + Number(row.count), 0);

    const employeesProcessed = await this.eventRepo
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.employeeCode)', 'count')
      .where('event.logDateTime BETWEEN :from AND :to', range)
      .getRawOne<{ count: string }>();
    const manualOverride = await this.auditRepo.count({
      where: { reasonCode: 'MANUAL_ATTENDANCE_OVERRIDE', createdAt: Between(range.from, range.to) },
    });

    return {
      date: range.from.toISOString().slice(0, 10),
      todaysPunches: await this.eventRepo.count({ where: { logDateTime: Between(range.from, range.to) } }),
      employeesProcessed: Number(employeesProcessed?.count ?? 0),
      present: decisionCount(['PRESENT', 'LATE_COMING', 'EARLY_GOING']),
      missPunch: decisionCount(['MISS_PUNCH', 'MISSING_IN', 'MISSING_OUT']),
      npnl: decisionCount(['NPNL']),
      weekOff: decisionCount(['WEEK_OFF']),
      holiday: decisionCount(['HOLIDAY']),
      leave: decisionCount(['LEAVE']),
      manualOverride,
      errors: statusCount(['FAILED', 'DEAD_LETTER']),
      retries: await this.eventRepo
        .createQueryBuilder('event')
        .select('COALESCE(SUM(event.attemptCount), 0)', 'count')
        .where('event.logDateTime BETWEEN :from AND :to', range)
        .getRawOne<{ count: string }>()
        .then((row) => Number(row?.count ?? 0)),
    };
  }

  async getLiveFeed(limit = 50) {
    const events = await this.eventRepo.find({ order: { updatedAt: 'DESC' }, take: limit });
    return events.map((event) => ({
      timestamp: event.updatedAt,
      employeeCode: event.employeeCode,
      employeeName: this.notAvailable('Employee name is not persisted in attendance_events.'),
      punchDirection: event.direction,
      punchTime: event.logDateTime,
      shift: this.notAvailable('Shift is only present in processing context/audit payload when available.'),
      processingStage: event.status,
      decision: event.decisionStatus,
      attendance: event.decisionStatus,
      status: event.status,
      attlogId: event.sourceId,
      exception: event.lastError,
    }));
  }

  async getEmployeeTrace(employeeCode: string, query: { date?: string }) {
    const range = this.dayRange(query.date);
    const events = await this.eventRepo.find({
      where: { employeeCode, logDateTime: Between(range.from, range.to) },
      order: { logDateTime: 'ASC' },
    });
    const audits = await this.auditRepo.find({
      where: { employeeCode, dutyDate: range.from.toISOString().slice(0, 10) },
      order: { createdAt: 'ASC' },
    });
    const latestAudit = audits[audits.length - 1] ?? null;

    // A5.5 API Contract Audit: `events`/`audit` below are handed back
    // verbatim as part of the GET /attendance/monitoring/employee/:employeeCode
    // response. Both AttendanceEvent and AttendanceAudit carry a tenant_id
    // column; strip it post-fetch (matches the pattern in
    // users.service.ts's findOne()) rather than hand-craft an explicit
    // .select() list, since these arrays are also consumed above to build
    // `timeline`/`ruleEvaluation` from the full entity shape.
    for (const event of events) delete (event as { tenantId?: string | null }).tenantId;
    for (const audit of audits) delete (audit as { tenantId?: string | null }).tenantId;

    return {
      employeeCode,
      employeeName: this.notAvailable('Search by name is unavailable because employee names are not persisted in attendance monitoring tables.'),
      date: range.from.toISOString().slice(0, 10),
      timeline: [
        ...events.map((event) => ({
          stage: 'Punch detected in attendance_events',
          executionTime: event.createdAt,
          duration: this.duration(event.createdAt, event.updatedAt),
          decision: event.decisionStatus,
          exception: event.lastError,
          status: event.status,
          attlogId: event.sourceId,
        })),
        ...audits.map((audit) => ({
          stage: audit.mode === 'RECONCILIATION' ? 'Reconciliation attendance update' : 'Attendance audit update',
          executionTime: audit.createdAt,
          duration: this.notAvailable('Per-stage duration is not persisted in attendance_audit.'),
          decision: audit.newStatus,
          exception: null,
          reason: audit.message,
          reasonCode: audit.reasonCode,
        })),
      ].sort((a, b) => new Date(a.executionTime).getTime() - new Date(b.executionTime).getTime()),
      ruleEvaluation: this.ruleEvaluationPanel(latestAudit),
      events,
      audit: audits,
    };
  }

  async getAudit(query: { date?: string; limit?: number; q?: string }) {
    const range = this.dayRange(query.date);
    const builder = this.auditRepo
      .createQueryBuilder('audit')
      .where('audit.createdAt BETWEEN :from AND :to', range)
      .orderBy('audit.createdAt', 'DESC')
      .take(query.limit ?? 100);
    if (query.q) {
      builder.andWhere('(audit.employeeCode ILIKE :q OR audit.reasonCode ILIKE :q OR audit.message ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    const rows = await builder.getMany();
    return rows.map((audit) => ({
      timestamp: audit.createdAt,
      employeeCode: audit.employeeCode,
      dutyDate: audit.dutyDate,
      oldValue: audit.oldValue,
      newValue: audit.newValue,
      oldStatus: audit.oldStatus,
      newStatus: audit.newStatus,
      reason: audit.message,
      reasonCode: audit.reasonCode,
      updatedBy: audit.mode,
      source: audit.mode,
      eventId: audit.eventId,
    }));
  }

  async getErrors(query: { date?: string; limit?: number; q?: string; status?: string; module?: string }) {
    const range = this.dayRange(query.date);
    const builder = this.eventRepo
      .createQueryBuilder('event')
      .where('event.updatedAt BETWEEN :from AND :to', range)
      .andWhere('(event.status IN (:...statuses) OR event.lastError IS NOT NULL)', {
        statuses: ['FAILED', 'DEAD_LETTER'],
      })
      .orderBy('event.updatedAt', 'DESC')
      .take(query.limit ?? 100);
    if (query.q) {
      builder.andWhere('(event.employeeCode ILIKE :q OR event.lastError ILIKE :q OR event.sourceId ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    if (query.status) builder.andWhere('event.status = :status', { status: query.status });
    const rows = await builder.getMany();
    return rows.map((event) => ({
      timestamp: event.updatedAt,
      employee: event.employeeCode,
      module: 'Attendance',
      exception: event.lastError,
      stackTrace: this.notAvailable('Stack traces are not persisted in attendance_events.'),
      retryStatus: event.status === 'DEAD_LETTER' ? 'Dead Letter' : event.attemptCount < 5 ? 'Retryable' : 'Retry exhausted',
      resolved: event.status === 'PROCESSED' || event.status === 'SKIPPED',
      attlogId: event.sourceId,
      attemptCount: event.attemptCount,
      status: event.status,
    }));
  }

  async getReconciliationMonitor() {
    const last = await this.findLatest(this.reconciliationRepo, { createdAt: 'DESC' });
    return {
      status: (last?.status === 'FAILED' ? 'Failed' : last?.status === 'RUNNING' ? 'Warning' : 'Healthy') as ComponentStatus,
      lastReconciliation: last?.createdAt ?? null,
      duration: this.notAvailable('Reconciliation end time/duration is not persisted.'),
      employeesProcessed: last?.processedCount ?? 0,
      rowsUpdated: this.notAvailable('Rows updated is not persisted separately from processed_count.'),
      rowsSkipped: this.notAvailable('Rows skipped is not persisted.'),
      errors: last?.failedCount ?? 0,
      retryCount: this.notAvailable('Reconciliation retry count is not persisted.'),
      nextScheduledRun: this.nextReconRun(),
      lastError: last?.errorMessage ?? null,
    };
  }

  async getPerformanceMetrics() {
    return {
      averageProcessingTime: await this.averageEventProcessingMs(),
      fastest: await this.processingAggregate('MIN'),
      slowest: await this.processingAggregate('MAX'),
      oracleQueryTime: this.notAvailable('Oracle query time is logged but not persisted.'),
      queueTime: this.notAvailable('Queue wait time is not persisted.'),
      decisionEngineTime: this.notAvailable('Decision engine timing is logged but not persisted.'),
      databaseUpdateTime: this.notAvailable('Database update timing is logged but not persisted.'),
      charts: {
        lastHour: await this.throughputSeries(60),
        last24Hours: await this.throughputSeries(24 * 60, 60),
        last7Days: await this.throughputSeries(7 * 24 * 60, 24 * 60),
      },
    };
  }

  async getDebugMode() {
    const rc = await this.attendanceConfig?.getRuntimeConfig();
    const enabled = rc?.debug ?? String(process.env['ATTENDANCE_DEBUG'] ?? 'false').toLowerCase() === 'true';
    return {
      enabled,
      mode: enabled ? 'ON' : 'OFF',
      source: rc ? 'attendance.runtime.debug (vendor config / ATTENDANCE_DEBUG env fallback)' : 'ATTENDANCE_DEBUG environment variable',
      writableFromDashboard: false,
      reason: 'Debug mode controls logger verbosity; changes via vendor portal take effect within 60 s without restart.',
    };
  }

  private async getRedisStatus() {
    const startedAt = Date.now();
    try {
      await this.redis.ping();
      return { status: 'Healthy' as ComponentStatus, latency: Date.now() - startedAt, lastUpdated: new Date() };
    } catch (err) {
      return {
        status: 'Failed' as ComponentStatus,
        latency: null,
        lastUpdated: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async findLatest<T extends ObjectLiteral>(
    repo: Repository<T>,
    order: Record<string, 'ASC' | 'DESC'>,
  ): Promise<T | null> {
    const rows = await repo.find({ order: order as any, take: 1 });
    return rows[0] ?? null;
  }

  private async getCursorPosition() {
    try {
      return await this.redis.get(CURSOR_KEY);
    } catch {
      return null;
    }
  }

  private async safeQueueCounts() {
    try {
      return await this.attendanceQueue.getJobCounts();
    } catch {
      return null;
    }
  }

  private async safeFailedJobs() {
    try {
      return await this.attendanceQueue.getFailed(0, 100);
    } catch {
      return [];
    }
  }

  private async averageEventProcessingMs() {
    const row = await this.eventRepo
      .createQueryBuilder('event')
      .select('AVG(EXTRACT(EPOCH FROM (event.processedAt - event.createdAt)) * 1000)', 'value')
      .where('event.processedAt IS NOT NULL')
      .getRawOne<{ value: string | null }>();
    return row?.value == null ? null : Math.round(Number(row.value));
  }

  private async processingAggregate(fn: 'MIN' | 'MAX') {
    const row = await this.eventRepo
      .createQueryBuilder('event')
      .select(`${fn}(EXTRACT(EPOCH FROM (event.processedAt - event.createdAt)) * 1000)`, 'value')
      .where('event.processedAt IS NOT NULL')
      .getRawOne<{ value: string | null }>();
    return row?.value == null ? null : Math.round(Number(row.value));
  }

  private async throughputSeries(minutesBack: number, bucketMinutes = 5) {
    const from = new Date(Date.now() - minutesBack * 60_000);
    const rows = await this.eventRepo
      .createQueryBuilder('event')
      .select(this.bucketExpression(bucketMinutes), 'bucket')
      .addSelect('COUNT(*)', 'count')
      .where('event.updatedAt >= :from', { from })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: Date; count: string }>();
    return rows.map((row) => ({ timestamp: row.bucket, count: Number(row.count) }));
  }

  private ruleEvaluationPanel(audit: AttendanceAudit | null) {
    const newValue = audit?.newValue ?? {};
    const oldValue = audit?.oldValue ?? {};
    return {
      shift: newValue['shiftCode'] ?? newValue['SHIFTACTUAL'] ?? null,
      plannedShift: oldValue['SHIFTPLAN'] ?? oldValue['shiftPlan'] ?? null,
      actualShift: newValue['SHIFTACTUAL'] ?? newValue['shiftActual'] ?? null,
      attendance: audit?.newStatus ?? null,
      firstIn: newValue['FROMDATETIME'] ?? newValue['fromDateTime'] ?? null,
      latestOut: newValue['TODATETIME'] ?? newValue['toDateTime'] ?? null,
      leave: newValue['leave'] ?? oldValue['LEAVEMASTER'] ?? null,
      weekOff: audit?.newStatus === 'WEEK_OFF',
      holiday: audit?.newStatus === 'HOLIDAY',
      lateThreshold: this.notAvailable('Late threshold is in rule snapshot, which is not persisted in attendance_audit.'),
      earlyExitThreshold: this.notAvailable('Early exit threshold is in rule snapshot, which is not persisted in attendance_audit.'),
      ruleTriggered: audit?.reasonCode ?? null,
      reason: audit?.message ?? null,
    };
  }

  private statusFromLatestEvent(event: AttendanceEvent | null): ComponentStatus {
    if (!event) return 'Warning';
    if (event.status === 'DEAD_LETTER') return 'Failed';
    if (event.status === 'FAILED') return 'Warning';
    return 'Healthy';
  }

  private card(name: string, status: ComponentStatus, lastUpdated: Date | null, latency: unknown) {
    return { name, status, lastUpdated, latency };
  }

  private dayRange(date?: string) {
    const base = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    const from = new Date(base);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }

  private todayRange() {
    return this.dayRange();
  }

  private duration(from: Date, to: Date | null) {
    return to ? to.getTime() - from.getTime() : null;
  }

  private numberEnv(name: string, fallback: number) {
    return Number.parseInt(process.env[name] ?? String(fallback), 10);
  }

  private async nextReconRun() {
    const rc   = await this.attendanceConfig?.getRuntimeConfig();
    const cron = rc?.reconCron ?? process.env['ATTENDANCE_RECON_CRON'] ?? '0 30 1 * * *';
    if (cron !== '0 30 1 * * *') {
      return this.notAvailable('Custom reconciliation cron parsing is not implemented in the monitoring read model.');
    }
    const next = new Date();
    next.setHours(1, 30, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return next;
  }

  private bucketExpression(bucketMinutes: number) {
    if (bucketMinutes >= 24 * 60) return "date_trunc('day', event.updatedAt)";
    if (bucketMinutes >= 60) return "date_trunc('hour', event.updatedAt)";
    return "date_trunc('minute', event.updatedAt)";
  }

  private notAvailable(reason: string) {
    return { value: null, available: false, reason };
  }

  async getGovernanceMetrics() {
    try {
      const [activeLocks, skipSummary] = await Promise.all([
        this.lockRepo
          ? this.lockRepo.count({ where: { isActive: true } })
          : Promise.resolve(0),
        this.skipLogRepo
          ? this.skipLogRepo
              .createQueryBuilder('sl')
              .select('sl.skip_reason', 'reason')
              .addSelect('COUNT(*)', 'count')
              .where('sl.skipped_at >= :since', { since: new Date(Date.now() - 24 * 60 * 60_000) })
              .groupBy('sl.skip_reason')
              .getRawMany<{ reason: string; count: string }>()
              .then(rows => {
                const summary: Record<string, number> = {};
                for (const row of rows) summary[row.reason] = parseInt(row.count, 10);
                return summary;
              })
          : Promise.resolve({}),
      ]);
      return { activeLocks, skipsLast24h: skipSummary };
    } catch {
      return { activeLocks: null, skipsLast24h: null };
    }
  }

  private unavailableNotes() {
    return [
      'Employee names, per-stage processing durations, stack traces, and granular rule snapshots are not currently persisted by the Attendance Module.',
      'The live feed is sourced from attendance_events and never queries Oracle ATTLOGS directly.',
    ];
  }
}

