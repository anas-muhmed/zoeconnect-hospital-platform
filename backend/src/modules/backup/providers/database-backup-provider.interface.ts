import { Readable } from 'stream';
import { TestConfigurationResult, EngineDescription } from '../services/pg-execution-strategy.interface';
import type { DiagnosticsReport } from '../services/backup-diagnostics.service';

/**
 * IDatabaseBackupProvider — the database-engine-agnostic seam BackupService/
 * RestoreService go through, so PostgreSQL is not hard-coded into this
 * module's core backup/restore logic even though PostgreSQL is the only
 * engine actually implemented today (point 8 of the "Database Backup
 * Service" review: "future-proof the provider model").
 *
 * This is generalized from what PgEngineService already does -- it is NOT a
 * reimplementation. `PostgresBackupProvider` (the only concrete
 * implementation today) is a thin adapter that composes/delegates every call
 * straight through to the existing, already-tested PgEngineService. A future
 * MySQL/SQL Server/Oracle provider would implement this same interface and
 * be registered in `DatabaseBackupProviderRegistry` -- no change required to
 * BackupService/RestoreService.
 *
 * Method names are `dump()`/`restore()` rather than PgEngineService's
 * `dumpDatabase()`/`restoreDatabase()` per the review's explicit naming
 * ("same method names where possible ... naming difference is fine") --
 * kept short/generic since "database" is already implied by this being a
 * *database* backup provider.
 *
 * `describe()` returns a Promise (not a bare `EngineDescription` as the
 * review's shorthand pseudocode literally wrote it) because resolving "which
 * strategy/container/path is in effect" inherently requires a DB read (see
 * IPgExecutionStrategy.describe()'s own doc comment, which this generalizes)
 * -- a synchronous signature was never actually implementable given the
 * existing PgEngineService this wraps.
 */
export interface IDatabaseBackupProvider {
  /** Machine-readable engine id, e.g. 'postgres'. Matches `backup.databaseType` config / DatabaseBackupProviderRegistry's resolution key. */
  readonly type: string;

  /** Returns a Readable streaming a full database dump in whatever format this engine's tooling natively produces. */
  dump(): Promise<Readable>;

  /** Restores `source` (a stream in this engine's native dump format) into the currently-configured database. */
  restore(source: Readable): Promise<void>;

  /** Best-effort server version string, or null if it can't be determined. */
  getServerVersion(): Promise<string | null>;

  /** Validates that this provider's tools are actually reachable/runnable right now. Never throws. */
  testConfiguration(): Promise<TestConfigurationResult>;

  /** Cheap, UI-facing description of the currently resolved strategy/engine. */
  describe(): Promise<EngineDescription>;

  /** Full "is this environment ready to back up" report -- see BackupDiagnosticsService. */
  runDiagnostics(): Promise<DiagnosticsReport>;
}
