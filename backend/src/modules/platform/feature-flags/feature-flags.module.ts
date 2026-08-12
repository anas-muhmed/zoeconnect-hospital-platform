import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsAdminController } from './feature-flags-admin.controller';
import { RequireFeatureGuard } from './guards/require-feature.guard';
import { RedisProvider } from '../../../common/redis/redis.provider';

/**
 * FeatureFlagsModule (Phase 11).
 *
 * `RequireFeatureGuard` is exported (not just `FeatureFlagsService`) so any
 * Business-module controller can `@UseGuards(..., RequireFeatureGuard)` +
 * `@RequireFeature('some.key')` by importing this module — mirroring how
 * `LicenseGuard` is consumed today from `LicenseModule`.
 *
 * There's no shared RedisModule in this codebase (see e.g. LicenseModule,
 * TokenModule, HisModule, AttendanceModule) -- every module that needs
 * `@InjectRedis()` registers `RedisProvider` directly in its own
 * `providers` array. `FeatureFlagsService` mirrors `LicenseService`'s
 * Redis-caching pattern exactly, so it needs the same provider here.
 */
@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlag])],
  providers: [FeatureFlagsService, RequireFeatureGuard, RedisProvider],
  controllers: [FeatureFlagsAdminController],
  exports: [FeatureFlagsService, RequireFeatureGuard],
})
export class FeatureFlagsModule {}
