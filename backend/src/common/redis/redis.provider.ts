import { Provider, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const client = new Redis({
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      db: config.get<number>('redis.db'),
      keyPrefix: config.get<string>('redis.keyPrefix', 'hdsp:'),
      // Phase 9 (Task 9.3): see redis.config.ts's `tls` doc comment.
      tls: config.get<boolean>('redis.tls') ? {} : undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('connect',       () => console.log('[Redis] Connected'));
    client.on('error',  (err)  => console.error('[Redis] Error:', err.message));
    client.on('reconnecting',  () => console.warn('[Redis] Reconnecting...'));

    return client;
  },
};

export const InjectRedis = () => Inject(REDIS_CLIENT);
