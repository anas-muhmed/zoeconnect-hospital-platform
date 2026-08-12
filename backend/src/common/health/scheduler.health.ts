import { Injectable, Optional } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * "Critical subsystems, not just infrastructure" readiness follow-up
 * (2026-08). A container can be fully connected to Postgres/Redis while
 * its cron scheduler (backup schedules, license-cache refresh, etc.)
 * silently never registered a single job -- readiness should catch that
 * too, not just DB/Redis connectivity.
 *
 * IMPORTANT: `ScheduleModule.forRoot()` is only loaded when
 * `PROCESS_ROLE !== 'api'` (see app.module.ts) -- a process legitimately
 * running as the dedicated API tier has NO `SchedulerRegistry` at all, by
 * design (cron/queue duty runs in a separate worker process there; see
 * BackupSchedulerService's own `@Optional()` handling of this exact
 * condition, which this indicator mirrors). That is expected, not a
 * failure -- reported as healthy with an explanatory note, so this check
 * never produces a false negative on an api-tier replica. This repo's
 * actual docker-compose.yml deployment does not set PROCESS_ROLE, so
 * `hdsp-backend` runs with the scheduler active and this indicator
 * checking it for real.
 *
 * When the registry IS present, "healthy" additionally requires at least
 * one cron job to actually be registered -- the registry existing but
 * being empty would mean the module loaded without anything actually
 * scheduling, which is a real, worth-surfacing failure mode (a
 * bootstrap-ordering bug, a provider that threw during its own
 * registration and got silently swallowed, etc.), not a normal state.
 */
@Injectable()
export class SchedulerHealthIndicator extends HealthIndicator {
  constructor(@Optional() private readonly schedulerRegistry?: SchedulerRegistry) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    if (!this.schedulerRegistry) {
      return this.getStatus(key, true, {
        note: 'SchedulerRegistry unavailable in this process (PROCESS_ROLE=api) -- cron jobs run in the worker process, not here. This is expected, not a failure.',
      });
    }

    const jobCount = this.schedulerRegistry.getCronJobs().size;
    if (jobCount === 0) {
      const result = this.getStatus(key, false, {
        registeredCronJobs: 0,
        error: 'SchedulerRegistry is present but has zero registered cron jobs -- the module loaded but nothing actually scheduled.',
      });
      throw new HealthCheckError('Scheduler check failed', result);
    }

    return this.getStatus(key, true, { registeredCronJobs: jobCount });
  }
}
