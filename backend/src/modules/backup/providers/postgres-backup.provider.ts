import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { IDatabaseBackupProvider } from './database-backup-provider.interface';
import { PgEngineService } from '../services/pg-engine.service';
import { BackupDiagnosticsService, DiagnosticsReport } from '../services/backup-diagnostics.service';
import { TestConfigurationResult, EngineDescription } from '../services/pg-execution-strategy.interface';

/**
 * PostgresBackupProvider — thin IDatabaseBackupProvider adapter over the
 * EXISTING PgEngineService (point 8 of the "Database Backup Service"
 * review). Deliberately does not reimplement any strategy-resolution/
 * detection/dump/restore logic -- every method here is a one-line delegate
 * to PgEngineService/BackupDiagnosticsService, which remain the actual
 * source of truth (and the thing PgEngineService's own unit tests already
 * cover). This class exists purely so BackupService/RestoreService can be
 * written against IDatabaseBackupProvider instead of importing PgEngineService
 * directly, per the review's "future-proof the provider model" ask.
 */
@Injectable()
export class PostgresBackupProvider implements IDatabaseBackupProvider {
  readonly type = 'postgres';

  constructor(
    private readonly pgEngineService: PgEngineService,
    private readonly diagnosticsService: BackupDiagnosticsService,
  ) {}

  dump(): Promise<Readable> {
    return this.pgEngineService.dumpDatabase();
  }

  restore(source: Readable): Promise<void> {
    return this.pgEngineService.restoreDatabase(source);
  }

  getServerVersion(): Promise<string | null> {
    return this.pgEngineService.getDatabaseVersion();
  }

  testConfiguration(): Promise<TestConfigurationResult> {
    return this.pgEngineService.testConfiguration();
  }

  async describe(): Promise<EngineDescription> {
    const strategy = await this.pgEngineService.resolveStrategy();
    return strategy.describe();
  }

  runDiagnostics(): Promise<DiagnosticsReport> {
    return this.diagnosticsService.runDiagnostics();
  }
}
