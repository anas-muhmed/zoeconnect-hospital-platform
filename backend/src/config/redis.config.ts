import { registerAs } from '@nestjs/config';
import { SharedBullAsyncConfiguration } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '300', 10), // seconds
  keyPrefix: 'hdsp:',
  // Phase 9 (Task 9.3): AWS ElastiCache with transit_encryption_enabled
  // requires TLS -- ioredis's object-style config (host/port/password, as
  // used here and in bullAsyncOptions below) does NOT auto-negotiate TLS
  // the way a `rediss://` URL string would; it must be requested
  // explicitly via a `tls` option. Self-hosted Redis (Docker Compose or
  // bare-metal, per DEPLOY.md) never sets this -- default false preserves
  // that unencrypted-localhost/LAN behavior exactly.
  tls: process.env.REDIS_TLS === 'true',
}));

// ── BullMQ async options ──────────────────────────────────────────────────────
export const bullAsyncOptions: SharedBullAsyncConfiguration = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    redis: {
      host: config.get<string>('redis.host'),
      port: config.get<number>('redis.port'),
      password: config.get<string>('redis.password'),
      db: config.get<number>('redis.db'),
      tls: config.get<boolean>('redis.tls') ? {} : undefined,
    },
    prefix: 'hdsp:bull',
    defaultJobOptions: {
      removeOnComplete: 100,  // Keep last 100 completed jobs for debugging
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  }),
};

// ── Redis Throttler storage factory ──────────────────────────────────────────
// Note: Requires @nestjs/throttler-storage-redis in package.json if used
// For now, using in-memory throttler storage (sufficient for single process)
export const redisThrottlerStorage = {
  provide: 'THROTTLER_STORAGE',
  useValue: null, // Replaced with Redis storage when cluster mode needed
};

// ── Queue Names (constants used across the codebase) ─────────────────────────
export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit-logs',
  LOYALTY_EVENTS: 'loyalty-events',
  CAMPAIGN_TRIGGERS: 'campaign-triggers',
  ATTENDANCE_REALTIME: 'attendance-realtime',
  // ZoeConnect Connector, Phase B (2026-07-21) -- durable job dispatch to a
  // specific tenant's connected Connector instance. See
  // ConnectorJobDispatchService.
  CONNECTOR_JOBS: 'connector-jobs',
  // D.6 ("Dynamic Per-Tenant HIS Query Architecture" production publication
  // lifecycle, 2026-07-22) -- durable retry/backoff wrapper around
  // HisQueryDefinitionPublisherService's automatic triggers (connector
  // reconnect, HIS_CONFIG_UPDATE webhook). See HisQueryPublishProcessor.
  // Manual admin-triggered republish/resync calls the publisher directly
  // (synchronous, immediate HTTP feedback) and does NOT go through this
  // queue -- only the unattended background triggers need Bull's retry.
  HIS_QUERY_PUBLISH: 'his-query-publish',
  // Backup & Restore module -- async run-backup/run-restore/verify/delete
  // jobs (BackupQueueProcessor). Same queue for both backup and restore
  // work (distinguished by job name, e.g. 'run-backup' vs 'run-restore'),
  // mirroring how AUDIT_LOGS is one queue for one processor rather than a
  // queue-per-job-type split.
  BACKUP: 'backup',
} as const;

// ── Cache Key Prefixes ────────────────────────────────────────────────────────
export const CACHE_KEYS = {
  PATIENT: (mrn: string) => `patient:${mrn}`,
  BILL: (billId: string) => `bill:${billId}`,
  PATIENT_BILLS: (mrn: string) => `patient-bills:${mrn}`,
  DOCTORS: 'ref:doctors',
  DEPARTMENTS: 'ref:departments',
  /**
   * Self-review fix (Redis-key audit, requested alongside findings 1-5):
   * was a plain global string (`'license:current'`) with no tenant in it
   * at all -- on a shared cloud backend, every tenant's cached
   * LicenseStatus collided in this one key. Now parameterized exactly
   * like FEATURE_FLAG below: one cache entry per tenant key, `'global'`
   * reserved for the genuine no-tenant-resolvable case (see
   * LicenseService's `resolveLicenseCacheTenantKey()`). Self-hosted always
   * resolves to its single 'default' tenant's UUID, so this collapses to
   * exactly one deterministic key there -- no functional change.
   */
  LICENSE: (tenantKey: string) => `license:current:${tenantKey}`,
  CARD_CATEGORIES: 'ref:card-categories',
  JWT_BLACKLIST: (jti: string) => `jwt:blacklist:${jti}`,
  USER_SESSION: (userId: string) => `session:${userId}`,
  SESSION_ACTIVITY: (jti: string) => `session:activity:${jti}`,
  /** Phase 11 (Feature Flags) — one cached row per (tenantId|'global', featureKey) pair. */
  FEATURE_FLAG: (tenantKey: string, featureKey: string) => `feature-flag:${tenantKey}:${featureKey}`,
} as const;
