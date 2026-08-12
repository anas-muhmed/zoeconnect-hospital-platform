import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { oracleConfig } from './config/oracle.config';
import { redisConfig } from './config/redis.config';
import { jwtConfig } from './config/jwt.config';
import { deploymentConfig } from './config/deployment.config';
import { backupConfig } from './config/backup.config';
import { licensingConfig } from './config/licensing.config';
import { billingConfig } from './config/billing.config';
import { razorpayConfig } from './config/razorpay.config';
import { typeOrmAsyncConfig } from './config/database.config';
import { redisThrottlerStorage, bullAsyncOptions } from './config/redis.config';
import { envValidationSchema } from './config/env.validation';

import { RequestIdMiddleware }  from './common/middleware/request-id.middleware';
import { AppController }        from './app.controller';
import { RedisHealthIndicator } from './common/health/redis.health';
import { OracleHealthIndicator } from './common/health/oracle.health';
import { BullHealthIndicator }  from './common/health/bull.health';
import { LicenseHealthIndicator } from './common/health/license.health';
import { SchedulerHealthIndicator } from './common/health/scheduler.health';
import { QUEUE_NAMES }          from './config/redis.config';
import { RedisProvider }        from './common/redis/redis.provider';

// Phase 1 — Auth, Users, RBAC, Audit
import { AuthModule }        from './modules/auth/auth.module';
import { UsersModule }       from './modules/users/users.module';
import { RbacModule }        from './modules/rbac/rbac.module';
import { SettingsModule }    from './modules/settings/settings.module';
import { AuditModule }       from './modules/audit/audit.module';

// Phase 2 — License Engine
import { LicensingModule }   from './modules/licensing/license.module';
import { BillingModule }     from './modules/billing/billing.module';

// Phase 3 — HIS Integration
import { HisModule }         from './modules/his/his.module';
import { BranchModule }       from './modules/branch/branch.module';

// ZoeConnect Identity Architecture Migration, Phase 1 — Organization Branch
// (independent of BranchModule's Oracle HIS flow above — see
// organization-branch.entity.ts's doc comment)
import { OrganizationBranchModule } from './modules/organization-branch/organization-branch.module';

// Hybrid Architecture Phase 10 — Tenant Provisioning
import { TenantProvisioningModule } from './modules/platform/tenant-provisioning/tenant-provisioning.module';
import { ConnectorModule } from './modules/platform/connector/connector.module';
import { KioskDeviceModule } from './modules/platform/kiosk-device/kiosk-device.module';

// Hybrid Architecture Phase 11 — Feature Flags
import { FeatureFlagsModule } from './modules/platform/feature-flags/feature-flags.module';

// Phase 4 — Loyalty Core
import { LoyaltyModule }        from './modules/loyalty/loyalty.module';

// Phase 5 — EIC Module
import { EicModule }            from './modules/eic/eic.module';
import { ChildrensVillageModule } from './modules/childrens-village/childrens-village.module';

// Phase 6 — Notification Engine
import { NotificationModule }   from './modules/notifications/notification.module';

// Phase 7 — Reporting & Analytics
import { ReportsModule }        from './modules/reports/reports.module';

// Phase 8 — Token Queue Management
import { TokenModule }          from './modules/token/token.module';

// HIS Real-time Sync
import { HisSyncModule }        from './modules/his/sync/his-sync.module';
import { AttendanceModule }     from './modules/attendance/attendance.module';

// Document Platform — ZoeConnect Healthcare Document Studio (Milestone 1: Document Engine only)
import { DocumentPlatformModule } from './modules/document-platform/document-platform.module';

// Remote Administration
import { VendorAdministrationModule } from './modules/vendor-administration/vendor-administration.module';

// Content Management System — digital signage (independent from Custom Display)
import { CmsModule } from './modules/cms/cms.module';

// Phase 12 - Incident Management Module
import { IncidentModule } from './modules/incident/incident.module';

// Backup & Restore Module — loads in BOTH deployment modes (self-hosted and
// cloud); cloud tenant isolation is enforced inside the module via
// TenantScopedRepository, not by excluding the module the way AttendanceModule
// is excluded from cloud. See backup.module.ts's doc comment.
import { BackupModule } from './modules/backup/backup.module';

// Patient Feedback & Experience Management (independent from HIS/patient lookup)
import { FeedbackModule } from './modules/feedback/feedback.module';

// Platform Services & Infrastructure (ZoeConnect Core Platform)
import { PlatformModule } from './modules/platform/platform.module';

// zoe-platform integration — Mortuary (Phase 2, Stage A: entities/module
// registration only; no controllers/routes exposed yet).
import { MortuaryModule } from './modules/mortuary/mortuary.module';

@Module({
  imports: [
    // ── Configuration ───────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, oracleConfig, redisConfig, jwtConfig, deploymentConfig, backupConfig, licensingConfig, billingConfig, razorpayConfig],
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // ── Database ─────────────────────────────────────────────────
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),

    // ── Rate Limiting ─────────────────────────────────────────────
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'global', ttl: 60000, limit: 100 },
      ],
    }),

    // ── Job Queues (BullMQ) ───────────────────────────────────────
    BullModule.forRootAsync(bullAsyncOptions),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_LOGS }), // needed by BullHealthIndicator

    // ── Domain Events ────────────────────────────────────────────
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.', maxListeners: 20 }),

    // ── Scheduled Jobs ────────────────────────────────────────────
    // Phase 9 (Task 9.6): PROCESS_ROLE='api' skips this entirely. NestJS's
    // @nestjs/schedule wires up every @Cron()/@Interval() method in the
    // app via a DiscoveryService scan that only runs when ScheduleModule
    // is imported somewhere in the graph -- omitting it here means zero
    // cron jobs fire in that process, full stop, regardless of which
    // feature module they're decorated in. This is the direct fix for the
    // "second replica double-processes every tick" risk the prior cloud
    // migration review (HDSP_Cloud_Migration_Architecture_Review.md)
    // flagged for horizontally-scaled API pods: an 'api'-role process
    // never registers cron in the first place, so scaling the API tier to
    // N tasks is safe by construction, not by convention. Default 'all'
    // (self-hosted, and any process that doesn't set PROCESS_ROLE)
    // preserves exactly today's behavior -- one process runs everything.
    ...(process.env.PROCESS_ROLE === 'api' ? [] : [ScheduleModule.forRoot()]),

    // ── Health Checks ─────────────────────────────────────────────
    TerminusModule,

    // ── JWT ─────────────────────────────────────────────────────────
    // Global registration used by JwtStrategy, TokenGateway, and other
    // consumers needing a JwtService instance outside AuthModule's own
    // scope. (Previously also justified by the now-unregistered
    // TenantScopeGuard -- Phase 5 of the ZoeConnect Identity Architecture
    // Migration -- which self-verified tokens independent of JwtAuthGuard's
    // execution order; this registration itself is unrelated to that guard
    // and stays regardless.)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '15m') },
      }),
    }),

    // ── Feature Modules ───────────────────────────────────────────
    // Phase 1
    PlatformModule,
    AuthModule,
    UsersModule,
    RbacModule,
    SettingsModule,
    AuditModule,
    // Phase 2
    LicensingModule,
    BillingModule,
    // Phase 3
    HisModule,
    BranchModule,
    // ZoeConnect Identity Architecture Migration, Phase 1 — Organization Branch
    OrganizationBranchModule,
    // Phase 4
    LoyaltyModule,
    // Phase 5
    EicModule,
    ChildrensVillageModule,
    // Phase 6
    NotificationModule,
    // Phase 7
    ReportsModule,
    // Phase 8
    TokenModule,
    // HIS Real-time Sync (imports HisModule + LoyaltyModule — kept separate to avoid circular dep)
    HisSyncModule,
    // Attendance — self-hosted only (decision, 2026-07-20). Attendance's
    // OraclePollingService + DependencyPollingOrchestrator continuously poll
    // a single process-wide Oracle connection pool (see OraclePoolService --
    // one OracleClient per backend process, no per-tenant routing). On a
    // shared multi-tenant cloud backend this cannot correctly serve more
    // than one hospital's real Oracle HIS at once, and for tenants with no
    // real Oracle configured (every cloud tenant today) it just polls
    // uselessly forever. Rather than gate this at runtime (which would still
    // start the queue processor, the schedulers, and the Oracle pool
    // connection attempt), AttendanceModule is excluded from the dependency
    // graph entirely for cloud: its controllers never register (so
    // /attendance/* 404s outright, not just "hidden in the UI"), and none of
    // its providers -- including DependencyPollingOrchestrator's
    // onApplicationBootstrap() setInterval -- ever construct. Self-hosted
    // (the only mode where DEPLOYMENT_MODE is unset or 'self_hosted')
    // is completely unaffected: this spreads to [AttendanceModule] exactly
    // as before. If this list needs to grow (e.g. HIS Oracle-config UI
    // module), extend the same pattern rather than scattering
    // `if (deploymentMode==='cloud')` checks through Attendance's own code.
    ...(process.env.DEPLOYMENT_MODE === 'cloud' ? [] : [AttendanceModule]),
    // Document Platform (Milestone 1 — see docs/architecture/MILESTONE_PLAN.md)
    DocumentPlatformModule,
    // Remote Administration
    VendorAdministrationModule,
    // Content Management System — digital signage
    CmsModule,
    // Patient Feedback & Experience Management
    FeedbackModule,
    // Hybrid Architecture Phase 10 — Tenant Provisioning
    TenantProvisioningModule,
    // ZoeConnect Connector, Phase A (2026-07-21) -- registration/token-refresh
    // endpoints only (POST /connector/register, POST /connector/token/refresh).
    // See HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md and
    // HDSP_CONNECTOR_CURRENT_STATE_AUDIT.md. No WebSocket gateway, no job
    // dispatch, no heartbeat yet -- those are later phases, deliberately
    // not built tonight.
    ConnectorModule,
    // Kiosk Desktop (Electron till) device registration/heartbeat -- see
    // kiosk-desktop/README.md. Mirrors ConnectorModule's shape above.
    KioskDeviceModule,
    // Hybrid Architecture Phase 11 — Feature Flags
    FeatureFlagsModule,
    // Hybrid Architecture Phase 12 — Incident Management
    IncidentModule,
    // Backup & Restore — self-hosted full-installation backups + cloud
    // per-tenant isolated backups. See backup.module.ts.
    BackupModule,
    // zoe-platform integration — Mortuary (Phase 2, Stage A). See
    // mortuary.module.ts's doc comment.
    MortuaryModule,
  ],
  controllers: [AppController],
  providers: [
    redisThrottlerStorage,
    RedisProvider,
    RedisHealthIndicator,
    OracleHealthIndicator,
    BullHealthIndicator,
    LicenseHealthIndicator,
    SchedulerHealthIndicator,
    // ZoeConnect Identity Architecture Migration, Phase 5 -- TenantScopeGuard
    // (Phase 8, Task 8.3) is no longer registered here. It cross-checked an
    // authenticated request's JWT tenantId claim against
    // SubdomainTenantMiddleware's Host-resolved request.tenantId -- exactly
    // the "Host-header dependency for authenticated requests" this phase
    // removes. Organization resolution for authenticated requests already
    // came entirely from the JWT everywhere else that matters
    // (TenantContextInterceptor/TenantContextStorage read
    // request.user.tenantId, never Host); this guard was the one remaining
    // place Host resolution reached into authenticated-request territory,
    // as a redundant safety cross-check, not the actual authorization
    // mechanism. The class itself is kept (not deleted) for reference/
    // rollback -- see its own doc comment.
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    // SubdomainTenantMiddleware is deliberately NOT registered here anymore
    // (fix, 2026-07-20 -- see that class's doc comment for the full
    // incident writeup). Nest's Fastify middleware compatibility layer
    // always invokes MiddlewareConsumer-registered middleware with the raw
    // Node request/response, never the real FastifyRequest/FastifyReply
    // every controller's @Req() and TenantScopeGuard actually receive --
    // any req.tenantId set here would be invisible everywhere it's read.
    // It's now invoked from a genuine Fastify onRequest hook in main.ts
    // instead, which receives the real FastifyRequest.
  }
}
