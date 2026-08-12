import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Existing entities
import { TokenLocation }   from './entities/token-location.entity';
import { TokenCounter }    from './entities/token-counter.entity';
import { TokenCall }       from './entities/token-call.entity';
import { DisplayPage }     from './entities/display-page.entity';
import { User }            from '../users/entities/user.entity';

// Phase 1 entities
import { TokenBranchConfig }    from './entities/token-branch-config.entity';
import { TokenKiosk }           from './entities/token-kiosk.entity';
import { TokenKioskAssignment } from './entities/token-kiosk-assignment.entity';
import { TokenScConfig }        from './entities/token-sc-config.entity';
import { TokenSequence }        from './entities/token-sequence.entity';
import { TokenRecord }          from './entities/token-record.entity';
import { TokenKioskBranding }   from './entities/token-kiosk-branding.entity';
import { TokenAnalyticsDaily }  from './entities/token-analytics-daily.entity';
import { TokenAuditLog }        from './entities/token-audit-log.entity';

// Controllers
import { TokenController }          from './token.controller';
import { TokenKioskController }     from './kiosk/token-kiosk.controller';
import { TokenConfigController }    from './config/token-config.controller';
import { TokenQueueController }     from './queue/token-queue.controller';
import { TokenAnalyticsController } from './analytics/token-analytics.controller';
import { DisplayController }    from './display/display.controller';
import { TokenPublicDisplayController } from './display/token-public-display.controller';
import { DisplayService }       from './display/display.service';

// Services
import { TokenService }           from './token.service';
import { TokenGateway }           from './token.gateway';
import { TokenKioskService }      from './kiosk/token-kiosk.service';
import { TokenConfigService }     from './config/token-config.service';
import { TokenAuditService }      from './audit/token-audit.service';
import { TokenSequenceService }   from './queue/token-sequence.service';
import { TokenQueueService }      from './queue/token-queue.service';
import { TokenDailyResetService } from './queue/token-daily-reset.service';
import { TokenAnalyticsService }  from './analytics/token-analytics.service';

// Registration sub-module
import { RegistrationModule } from './registration/registration.module';
import { WorkstationModule }  from './workstation/workstation.module';

// Infrastructure
import { RedisProvider }   from '../../common/redis/redis.provider';
import { LicensingModule } from '../licensing/license.module';
import { HisModule }       from '../his/his.module';

// Stage B (Checkpoint B3.8) — tenant scoping infrastructure
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Phase 2 (Hybrid Architecture) — object storage abstraction seam
import { StorageModule } from '../platform/services/object-repository/object-repository.module';

@Module({
  imports: [
    LicensingModule,
    HisModule,
    RegistrationModule,
    WorkstationModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      // existing
      TokenLocation, TokenCounter, TokenCall, DisplayPage, User,
      // phase 1
      TokenBranchConfig, TokenKiosk, TokenKioskAssignment,
      TokenScConfig, TokenSequence, TokenRecord,
      TokenKioskBranding, TokenAnalyticsDaily, TokenAuditLog,
    ]),
    TenantModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [
    TokenController,
    TokenKioskController,
    TokenConfigController,
    TokenQueueController,
    TokenAnalyticsController,
    DisplayController,
    TokenPublicDisplayController,
  ],
  providers: [
    TokenService, TokenGateway, RedisProvider,
    TokenKioskService, TokenConfigService, TokenAuditService,
    TokenSequenceService, TokenQueueService, TokenDailyResetService,
    TokenAnalyticsService,
    DisplayService,

    // Stage B (Checkpoint B3.8) — scoped repositories for the 9 session-resolved
    // eligible read methods identified in the pre-flight. Alongside (not
    // replacing) the raw TypeOrmModule.forFeature repositories above.
    // TokenCounter/TokenSequence/TokenKioskBranding/TokenAnalyticsDaily/
    // TokenAuditLog get no provider — no eligible read method touches them
    // (TokenAnalyticsService is 100% raw SQL; TokenAuditService's read methods
    // are dead code; TokenKioskBranding's getPublicKioskConfig() read is
    // chain-resolved-only).
    //
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
    // audit/fix pass triggered by the confirmed Users cross-tenant leak — see
    // HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
    createTenantScopedRepositoryProvider(TokenCall, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenRecord, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenKiosk, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenKioskAssignment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenLocation, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenBranchConfig, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(TokenScConfig, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(DisplayPage, { mode: 'enforced' }),
  ],
  exports: [
    TokenService, TokenKioskService, TokenConfigService,
    TokenQueueService, TokenAnalyticsService,
  ],
})
export class TokenModule {}
