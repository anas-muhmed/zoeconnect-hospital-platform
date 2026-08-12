import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { InjectRedis } from '../redis/redis.provider';

/**
 * RedisHealthIndicator previously built its own standalone ioredis client
 * (separate `new Redis({...})` in this constructor) instead of reusing the
 * app's shared `REDIS_CLIENT` provider. That second connection had no
 * `.on('error', ...)` listener attached, so any failure on it (auth,
 * network) fell through to ioredis's own default fallback logging --
 * `[ioredis] Unhandled error event: ...` with no context -- rather than the
 * clearly-labeled `[Redis] Error: ...` every other client in this codebase
 * logs (see RedisProvider). It also meant Redis auth/connectivity was
 * configured in two independent places that could drift.
 * Fixed to `@InjectRedis()` the same shared client every other service in
 * this codebase uses (LicenseService, TokenService, etc.) -- one Redis
 * connection per process, one error-handling path, matching the
 * established convention.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    private readonly config: ConfigService,
    @InjectRedis() private readonly client: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.client.ping();
      const isHealthy = pong === 'PONG';
      const result = this.getStatus(key, isHealthy, {
        status: pong,
        host: this.config.get<string>('redis.host'),
        port: this.config.get<number>('redis.port'),
      });
      if (!isHealthy) throw new HealthCheckError('Redis check failed', result);
      return result;
    } catch (error) {
      const result = this.getStatus(key, false, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new HealthCheckError('Redis check failed', result);
    }
  }
}
