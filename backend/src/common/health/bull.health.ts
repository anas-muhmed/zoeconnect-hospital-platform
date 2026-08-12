import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../config/redis.config';

/**
 * BullMQ health indicator.
 * Checks that the audit-logs queue is reachable (backed by Redis).
 * A failing queue means Redis is down — critical because JTI blacklist lives there.
 */
@Injectable()
export class BullHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue(QUEUE_NAMES.AUDIT_LOGS) private readonly auditQueue: Queue,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const client = await (this.auditQueue as any).client;
      // Bull exposes the underlying ioredis client — ping it
      const counts = await this.auditQueue.getJobCounts();
      const result = this.getStatus(key, true, {
        waiting: counts.waiting,
        active:  counts.active,
        failed:  counts.failed,
        delayed: counts.delayed,
      });
      return result;
    } catch (err) {
      const result = this.getStatus(key, false, {
        error: err instanceof Error ? err.message : 'Queue unreachable',
      });
      throw new HealthCheckError('BullMQ check failed', result);
    }
  }
}
