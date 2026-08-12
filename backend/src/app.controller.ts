import { Controller, Get, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisHealthIndicator }    from './common/health/redis.health';
import { OracleHealthIndicator }   from './common/health/oracle.health';
import { BullHealthIndicator }     from './common/health/bull.health';
import { LicenseHealthIndicator }  from './common/health/license.health';
import { SchedulerHealthIndicator } from './common/health/scheduler.health';
import { getBuildInfo } from './common/build-info';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly redisHealth:     RedisHealthIndicator,
    private readonly oracleHealth:    OracleHealthIndicator,
    private readonly bullHealth:      BullHealthIndicator,
    private readonly licenseHealth:   LicenseHealthIndicator,
    private readonly schedulerHealth: SchedulerHealthIndicator,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  root() {
    return {
      name: 'ZoeConnect',
      status: 'running',
      timestamp: new Date().toISOString(),
      ...getBuildInfo(),
    };
  }

  @Get('health')
  @HealthCheck()
  @ApiOperation({ summary: 'System health check - all infrastructure components' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgresql', { connection: this.dataSource }),
      () => this.redisHealth.isHealthy('redis'),
      () => this.oracleHealth.isHealthy('oracle-his'),
      () => this.bullHealth.isHealthy('bull-queues'),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.disk.checkStorage('disk', {
        thresholdPercent: 0.95,
        path: process.platform === 'win32' ? 'C:\\' : '/',
      }),
    ]);
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe - is the process alive?' })
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * CRITICAL FIX (readiness follow-up, 2026-08): "is Postgres/Redis
   * reachable" answers a narrower question than "can this application
   * actually serve production traffic" -- a backend can pass both of
   * those checks while its scheduler never registered a job, its license
   * cache is broken, its Oracle/HIS transport is down, or its BullMQ
   * queues are unreachable, and still be functionally degraded. This
   * endpoint now checks BOTH tiers explicitly and separately:
   *
   *   infrastructure -- PostgreSQL, Redis (raw connectivity)
   *   application    -- Oracle/HIS transport, BullMQ queues, license
   *                      service (a real getStatus() call, not a ping),
   *                      cron scheduler (registered job count)
   *
   * Each tier is checked independently (its own try/catch) so a failure
   * in one doesn't hide the other tier's results -- the response always
   * reports both sections, not just whichever failed first. Overall
   * status is 'ready' only if EVERY check in BOTH tiers passes; otherwise
   * this throws ServiceUnavailableException (503), which is what
   * deploy.sh/rollback.sh's `curl -sSf` (and Docker's own HEALTHCHECK)
   * actually key off of -- a 200 body with an embedded "degraded" string
   * would silently defeat the whole point if nothing enforced the status
   * code to match.
   */
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe - can this application actually serve production traffic?' })
  async readiness() {
    let infrastructure: HealthCheckResult['details'];
    let infraOk = true;
    try {
      const result = await this.health.check([
        () => this.db.pingCheck('postgresql', { connection: this.dataSource }),
        () => this.redisHealth.isHealthy('redis'),
      ]);
      infrastructure = result.details;
    } catch (err) {
      infraOk = false;
      const response = err instanceof HttpException ? (err.getResponse() as any) : undefined;
      infrastructure = response?.details ?? { error: err instanceof Error ? err.message : 'infrastructure check threw unexpectedly' };
    }

    let application: HealthCheckResult['details'];
    let appOk = true;
    try {
      const result = await this.health.check([
        () => this.oracleHealth.isHealthy('oracle-his'),
        () => this.bullHealth.isHealthy('bull-queues'),
        () => this.licenseHealth.isHealthy('license-service'),
        () => this.schedulerHealth.isHealthy('scheduler'),
      ]);
      application = result.details;
    } catch (err) {
      appOk = false;
      const response = err instanceof HttpException ? (err.getResponse() as any) : undefined;
      application = response?.details ?? { error: err instanceof Error ? err.message : 'application check threw unexpectedly' };
    }

    const body = {
      status: infraOk && appOk ? 'ready' : 'degraded',
      ...getBuildInfo(),
      infrastructure,
      application,
      timestamp: new Date().toISOString(),
    };

    if (!infraOk || !appOk) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
