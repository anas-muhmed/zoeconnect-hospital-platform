import { Module } from '@nestjs/common';
import { TypeOrmModule }       from '@nestjs/typeorm';
import { BullModule }          from '@nestjs/bull';
import { ConfigService }       from '@nestjs/config';
import { NotificationLog }      from './entities/notification-log.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationService }  from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationController } from './notification.controller';
import { WhatsAppService }       from './whatsapp.service';
import { WhatsAppTransport }     from './providers/whatsapp.transport';
import { LocalNotificationProvider } from './providers/local-notification.provider';
import { CloudNotificationProvider } from './providers/cloud-notification.provider';
import { INotificationProvider } from '../platform/infrastructure/notifications/notification-provider.interface';
import { NOTIFICATION_TRANSPORT, NOTIFICATION_PROVIDER } from '../platform/infrastructure/tokens';
import { LicensingModule }       from '../licensing/license.module';
import { QUEUE_NAMES }           from '../../config/redis.config';
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

/**
 * Stage B (Checkpoint B3.1) — Notification is the pilot module for read-side
 * tenant enforcement (see `HYBRID_ARCHITECTURE_LOG.md`'s B3.1 entry and
 * `STAGE_B_IMPLEMENTATION_PLAN.md`'s B3.1 success-criteria sequence).
 *
 * `TenantModule` is imported so `TenantContextStorage` (and
 * `TenantContextInterceptor`, applied directly on `NotificationController`,
 * not registered globally) are available in this module's DI scope.
 *
 * `createTenantScopedRepositoryProvider` adds `TenantScopedRepository`
 * instances for `NotificationLog`/`NotificationTemplate` *alongside* the
 * existing raw `Repository` providers from `TypeOrmModule.forFeature`
 * above — both are still live in this module, exactly per the scoped
 * rollout boundary: only `NotificationService`'s four GET-backing read
 * methods (`findLogs`, `findLogById`, `findTemplates`, `findTemplate`) are
 * being switched over; every write path keeps using the raw repositories
 * unchanged.
 *
 * Started in `mode: 'dry-run'`; flipped to `mode: 'enforced'` (2026-07-14)
 * after the office-environment verification runbook passed cleanly —
 * see `HYBRID_ARCHITECTURE_LOG.md`'s B3.1 completion entry. B3.1 is now the
 * first module with live tenant-scoped read enforcement in this codebase.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, NotificationTemplate]),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    LicensingModule,
    TenantModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    WhatsAppService,
    WhatsAppTransport,
    { provide: NOTIFICATION_TRANSPORT, useExisting: WhatsAppTransport },
    LocalNotificationProvider,
    CloudNotificationProvider,
    // Phase 5 (Task 5.4) mode-selection: both providers are always
    // registered (cheap -- CloudNotificationProvider's constructor only
    // builds SES/SNS clients, no eager network calls), but only one is
    // ever bound to NOTIFICATION_PROVIDER, selected by
    // NOTIFICATION_PROVIDER_MODE (env.validation.ts: 'local' | 'cloud',
    // default 'local'). Mirrors StorageModule (Phase 3) and
    // LicensingModule (Phase 4)'s identical factory pattern exactly.
    // Unset/'local' is byte-for-byte Phase 5.2's original wiring -- zero
    // behavior change for every current deployment.
    {
      provide: NOTIFICATION_PROVIDER,
      useFactory: (
        config: ConfigService,
        local: LocalNotificationProvider,
        cloud: CloudNotificationProvider,
      ): INotificationProvider =>
        config.get<string>('NOTIFICATION_PROVIDER_MODE', 'local') === 'cloud' ? cloud : local,
      inject: [ConfigService, LocalNotificationProvider, CloudNotificationProvider],
    },
    createTenantScopedRepositoryProvider(NotificationLog, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(NotificationTemplate, { mode: 'enforced' }),
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
