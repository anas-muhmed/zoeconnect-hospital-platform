import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IDatabaseBackupProvider } from './database-backup-provider.interface';
import { PostgresBackupProvider } from './postgres-backup.provider';

/**
 * DatabaseBackupProviderRegistry — resolves the ACTIVE IDatabaseBackupProvider
 * from `backup.databaseType` config (defaults to 'postgres'; env var
 * `BACKUP_DATABASE_TYPE`). This is the seam that makes "PostgreSQL today,
 * MySQL/SQL Server/Oracle later" true architecturally: adding a new engine
 * later means writing a new `IDatabaseBackupProvider` implementation and
 * adding one case to `getActiveProvider()`'s switch -- no change to
 * BackupService/RestoreService, which only ever call
 * `getActiveProvider()`.
 *
 * No MySQL/SQL Server/Oracle providers are implemented here (out of scope
 * per the review) -- selecting anything other than 'postgres' throws a
 * clear, actionable error rather than silently falling back to Postgres.
 */
@Injectable()
export class DatabaseBackupProviderRegistry {
  constructor(
    private readonly configService: ConfigService,
    private readonly postgresProvider: PostgresBackupProvider,
  ) {}

  getActiveProvider(): IDatabaseBackupProvider {
    const databaseType = this.configService.get<string>('backup.databaseType') || 'postgres';
    switch (databaseType) {
      case 'postgres':
        return this.postgresProvider;
      default:
        throw new Error(`Database type '${databaseType}' is not yet supported. Only 'postgres' is implemented today.`);
    }
  }
}
