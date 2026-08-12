import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InjectRedis } from '../../../common/redis/redis.provider';
import type { Redis } from 'ioredis';
import { CACHE_KEYS } from '../../../config/redis.config';
import { FeatureFlag, FeatureFlagState } from './entities/feature-flag.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes — identical TTL to LicenseService.getStatus()'s pattern (Phase 2/4)
const GLOBAL_KEY = 'global';

export interface FeatureFlagResolution {
  featureKey: string;
  enabled: boolean;
  state: FeatureFlagState;
  /** Which row answered the question: a tenant-specific override, the platform-wide default, or neither (defaulted to disabled). */
  source: 'tenant' | 'global' | 'default';
}

/**
 * FeatureFlagService (Phase 11, Task 11.1).
 *
 * Mirrors `LicenseService.getStatus()`'s exact caching shape (Phase 2/4):
 * same Redis client (`InjectRedis()`/`ioredis`, not a separate cache
 * layer), same 5-minute TTL, same "cache miss or Redis error -> fall
 * through to DB, never throw" resilience posture, same "write path calls
 * redis.del() to bust" invalidation model. Deliberately not a shared
 * abstraction with `LicenseService` — the two check different things
 * (module-level license vs. within-module feature) and duplicating this
 * much simpler logic once, matching the pattern by eye, is cheaper and
 * clearer than introducing a shared generic cache-wrapper for two
 * call sites.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    @InjectRepository(FeatureFlag) private readonly flagRepo: Repository<FeatureFlag>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Core check consumed by `RequireFeatureGuard`. Resolution order:
   * tenant-specific row (`tenant_id = tenantId`) first, then the
   * platform-wide default row (`tenant_id IS NULL`), then `disabled` if
   * neither exists — an unconfigured feature is off by default, never
   * silently on, so a newly deployed `@RequireFeature()` call site can't
   * accidentally expose unfinished behavior.
   *
   * `state: 'beta'` is treated as enabled here — the distinction between
   * `enabled` and `beta` is informational for the admin UI (Task 11.4),
   * not a different runtime effect in this phase's pilot. Percentage-based
   * gradual rollout (`rolloutPercentage`) is stored but not evaluated yet;
   * see the entity's doc comment for why.
   */
  async isEnabled(tenantId: string | null, featureKey: string): Promise<boolean> {
    const resolution = await this.resolve(tenantId, featureKey);
    return resolution.enabled;
  }

  async resolve(tenantId: string | null, featureKey: string): Promise<FeatureFlagResolution> {
    const tenantKey = tenantId ?? GLOBAL_KEY;
    const cacheKey = CACHE_KEYS.FEATURE_FLAG(tenantKey, featureKey);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as FeatureFlagResolution;
      }
    } catch (err) {
      this.logger.warn(`Redis get failed for feature flag '${featureKey}', falling back to DB: ${(err as Error).message}`);
    }

    const resolution = await this.resolveFromDb(tenantId, featureKey);

    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(resolution));
    } catch (err) {
      this.logger.warn(`Redis setex failed for feature flag '${featureKey}' (non-fatal): ${(err as Error).message}`);
    }

    return resolution;
  }

  private async resolveFromDb(tenantId: string | null, featureKey: string): Promise<FeatureFlagResolution> {
    if (tenantId) {
      const tenantRow = await this.flagRepo.findOne({ where: { tenantId, featureKey } });
      if (tenantRow) {
        return { featureKey, enabled: tenantRow.state !== 'disabled', state: tenantRow.state, source: 'tenant' };
      }
    }

    const globalRow = await this.flagRepo.findOne({ where: { tenantId: IsNull(), featureKey } });
    if (globalRow) {
      return { featureKey, enabled: globalRow.state !== 'disabled', state: globalRow.state, source: 'global' };
    }

    return { featureKey, enabled: false, state: 'disabled', source: 'default' };
  }

  /**
   * Upsert a flag row (admin API, Task 11.4) and bust exactly the one
   * cache key it can affect — mirrors `LicenseService.uploadLicense()`'s
   * pattern of "write, then `redis.del()`", scoped narrowly to this
   * (tenantId, featureKey) pair rather than flushing the whole cache.
   */
  async setFlag(params: {
    tenantId: string | null;
    featureKey: string;
    state: FeatureFlagState;
    rolloutPercentage?: number | null;
    description?: string | null;
    updatedBy?: string | null;
  }): Promise<FeatureFlag> {
    const { tenantId, featureKey } = params;
    let row = await this.flagRepo.findOne({ where: { tenantId: tenantId ? tenantId : IsNull(), featureKey } });
    if (!row) {
      row = this.flagRepo.create({ tenantId, featureKey });
    }
    row.state = params.state;
    row.rolloutPercentage = params.rolloutPercentage ?? null;
    row.description = params.description ?? row.description ?? null;
    row.updatedBy = params.updatedBy ?? null;
    const saved = await this.flagRepo.save(row);

    const tenantKey = tenantId ?? GLOBAL_KEY;
    try {
      await this.redis.del(CACHE_KEYS.FEATURE_FLAG(tenantKey, featureKey));
    } catch (err) {
      this.logger.warn(`Redis del failed while busting feature flag cache for '${featureKey}' (non-fatal): ${(err as Error).message}`);
    }

    this.logger.log(`Feature flag '${featureKey}' set to '${saved.state}' for ${tenantId ? `tenant ${tenantId}` : 'platform-wide default'}`);
    return saved;
  }

  async listFlags(tenantId?: string | null): Promise<FeatureFlag[]> {
    if (tenantId === undefined) {
      return this.flagRepo.find({ order: { featureKey: 'ASC' } });
    }
    return this.flagRepo.find({
      where: { tenantId: tenantId ? tenantId : IsNull() },
      order: { featureKey: 'ASC' },
    });
  }
}
