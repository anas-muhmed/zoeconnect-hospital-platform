import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../config/redis.config';

// Entities
import { BackupJob } from './entities/backup-job.entity';
import { BackupSchedule } from './entities/backup-schedule.entity';
import { RestoreJob } from './entities/restore-job.entity';
import { BackupStorageConfig } from './entities/backup-storage-config.entity';
import { BackupJobDestination } from './entities/backup-job-destination.entity';
import { BackupToolSettings } from './entities/backup-tool-settings.entity';

// Tenant scoping
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Platform / shared modules this module's staging logic depends on
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { LicensingModule } from '../licensing/license.module';
import { NotificationModule } from '../notifications/notification.module';

// Services
import { BackupService } from './backup.service';
import { RestoreService } from './restore.service';
import { BackupManifestService } from './services/backup-manifest.service';
import { BackupVerificationService } from './services/backup-verification.service';
import { BackupCompressionService } from './services/backup-compression.service';
import { BackupEncryptionService } from './services/backup-encryption.service';
import { BackupArchiveService } from './services/backup-archive.service';
import { PgDumpService } from './services/pg-dump.service';
import { PgToolsService } from './services/pg-tools.service';
import { PgEngineService } from './services/pg-engine.service';
import { PgDockerDetectionService } from './services/pg-docker-detection.service';
import { BackupCredentialCipherService } from './services/backup-credential-cipher.service';
import { BackupDestinationResolverService } from './services/backup-destination-resolver.service';
import { BackupDestinationWriterService } from './services/backup-destination-writer.service';
import { BackupStorageConfigService } from './services/backup-storage-config.service';
import { BackupSchedulerService } from './scheduler/backup-scheduler.service';
import { BackupDiagnosticsService } from './services/backup-diagnostics.service';
import { BackupHealthCheckService } from './services/backup-health-check.service';

// Providers
import { LocalBackupStorageProvider } from './providers/local-backup-storage.provider';
import { S3BackupStorageProvider } from './providers/s3-backup-storage.provider';
import { AzureBackupStorageProvider } from './providers/azure-backup-storage.provider';
import { GcsBackupStorageProvider } from './providers/gcs-backup-storage.provider';
import { SftpBackupStorageProvider } from './providers/sftp-backup-storage.provider';
import { NetworkShareBackupStorageProvider } from './providers/network-share-backup-storage.provider';
import { BackupStorageProviderFactory } from './providers/backup-storage-provider.factory';
import { PostgresBackupProvider } from './providers/postgres-backup.provider';
import { DatabaseBackupProviderRegistry } from './providers/database-backup-provider.registry';

// Queue
import { BackupQueueProcessor } from './queue/backup-queue.processor';

// Controllers
import { BackupController } from './backup.controller';
import { RestoreController } from './restore.controller';

/**
 * BackupModule — Backup & Restore. Loads in BOTH deployment modes (unlike
 * e.g. AttendanceModule, which is self-hosted-only) per the task brief:
 * cloud tenants get their own isolated per-tenant backups via the same
 * TenantScopedRepository mechanism every other tenant-isolated module in
 * this codebase uses (see createTenantScopedRepositoryProvider calls
 * below), rather than a deployment-mode-conditional import.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BackupJob, BackupSchedule, RestoreJob, BackupStorageConfig, BackupJobDestination, BackupToolSettings]),
    BullModule.registerQueue({ name: QUEUE_NAMES.BACKUP }),
    TenantModule,
    AuditModule,
    SettingsModule,
    LicensingModule,
    NotificationModule,
  ],
  controllers: [BackupController, RestoreController],
  providers: [
    // Tenant-scoped repositories — every row in this module is isolated per
    // tenant in cloud mode, enforced at the repository layer (not just the
    // HTTP guard) per the task's tenant-isolation requirement.
    createTenantScopedRepositoryProvider(BackupJob, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(BackupSchedule, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(RestoreJob, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(BackupStorageConfig, { mode: 'enforced' }),

    // Core services
    BackupService,
    RestoreService,
    BackupManifestService,
    BackupVerificationService,
    BackupCompressionService,
    BackupEncryptionService,
    BackupArchiveService,
    PgDumpService,
    PgToolsService,
    PgEngineService,
    PgDockerDetectionService,
    BackupCredentialCipherService,
    BackupDestinationResolverService,
    BackupDestinationWriterService,
    BackupStorageConfigService,
    BackupSchedulerService,
    BackupDiagnosticsService,
    BackupHealthCheckService,

    // Storage providers (all always registered; factory picks the right one per destination)
    LocalBackupStorageProvider,
    S3BackupStorageProvider,
    AzureBackupStorageProvider,
    GcsBackupStorageProvider,
    SftpBackupStorageProvider,
    NetworkShareBackupStorageProvider,
    BackupStorageProviderFactory,

    // Database backup provider abstraction (point 8) -- PostgresBackupProvider
    // wraps PgEngineService; DatabaseBackupProviderRegistry resolves the
    // active provider from `backup.databaseType` config. BackupService/
    // RestoreService depend on the registry, not PgEngineService directly.
    PostgresBackupProvider,
    DatabaseBackupProviderRegistry,

    // Queue
    BackupQueueProcessor,
  ],
  exports: [BackupService, RestoreService, BackupSchedulerService, PgToolsService],
})
export class BackupModule {}
