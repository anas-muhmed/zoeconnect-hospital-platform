import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * CMSSettings --- a single-row table of global, admin-tunable CMS
 * parameters. CmsSettingsService always operates on the first (and only)
 * row it finds, creating it with these defaults on first read if the table
 * is empty -- see getSettings(). Exists so the player and backend never
 * hard-code intervals/limits ("no magic constants" per the v1.0 spec).
 */
@Entity('cms_settings')
export class CMSSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A2) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'int', name: 'player_poll_interval_ms', default: 30000 })
  playerPollIntervalMs: number;

  @Column({ type: 'int', name: 'heartbeat_interval_ms', default: 30000 })
  heartbeatIntervalMs: number;

  @Column({ type: 'int', name: 'retry_count', default: 4 })
  retryCount: number;

  @Column({ type: 'int', name: 'retry_delay_ms', default: 1000 })
  retryDelayMs: number;

  @Column({ type: 'int', name: 'offline_timeout_ms', default: 90000 })
  offlineTimeoutMs: number;

  @Column({ type: 'int', name: 'max_cache_size_mb', default: 2048 })
  maxCacheSizeMb: number;

  @Column({ type: 'int', name: 'log_retention_days', default: 30 })
  logRetentionDays: number;

  @Column({ type: 'boolean', name: 'auto_cleanup_enabled', default: true })
  autoCleanupEnabled: boolean;

  @Column({ type: 'int', name: 'default_image_duration_seconds', default: 10 })
  defaultImageDurationSeconds: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
