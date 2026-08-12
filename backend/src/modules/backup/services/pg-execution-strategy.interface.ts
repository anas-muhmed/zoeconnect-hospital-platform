import { Readable } from 'stream';

/**
 * Result of validating a pg_dump/pg_restore-capable engine. Mirrors
 * PgToolsService's original TestConfigurationResult shape (kept name-
 * compatible so PgToolsService.testConfiguration() can be reused as-is by
 * LocalPgExecutionStrategy/PgDumpService without any adapter).
 */
export interface TestConfigurationResult {
  ok: boolean;
  pgDumpVersion?: string;
  pgRestoreVersion?: string;
  compatible?: boolean;
  message: string;
}

/**
 * Human/UI-facing description of the currently resolved execution engine --
 * what PgEngineService.getEngineStatus() is built from.
 */
export interface EngineDescription {
  mode: 'local' | 'docker' | 'bundled' | 'unavailable';
  version: string | null;
  /** Human-readable location string, e.g. "Detected Automatically", "Docker container: pg17", "Custom (Advanced override)", "Bundled with ZoeConnect", "Not detected". */
  location: string;
  detectedAutomatically: boolean;
}

/**
 * IPgExecutionStrategy — a single abstraction over "how do we actually run
 * pg_dump/pg_restore/psql for this backup or restore job", so
 * BackupService/RestoreService (via PgEngineService) never need to know
 * whether the tools are installed on the host, running inside a Docker
 * container, or bundled with the app. Every implementation must never throw
 * a raw OS error out of these 4 public methods -- errors are translated into
 * either a rejected Promise with a clear message (dumpDatabase/
 * restoreDatabase/getDatabaseVersion) or a { ok: false, message } result
 * (testConfiguration), exactly like the pre-existing PgDumpService/
 * PgToolsService contract this replaces.
 */
export interface IPgExecutionStrategy {
  /** Returns a Readable streaming a full database dump (custom format, `-Fc`). */
  dumpDatabase(): Promise<Readable>;

  /** Pipes `source` into the restore tool's stdin against the current database. */
  restoreDatabase(source: Readable): Promise<void>;

  /** Best-effort server version string (e.g. "16.2"), or null if it can't be determined. */
  getDatabaseVersion(): Promise<string | null>;

  /** Validates that this strategy's tools are actually reachable/runnable right now. Never throws. */
  testConfiguration(): Promise<TestConfigurationResult>;

  /**
   * Cheap description of this strategy for the UI health card -- must not
   * spawn a child process (may read cached DB state, e.g. resolved paths/
   * detected version, but never runs `--version` itself; that's what
   * testConfiguration() is for). Async because resolving which path/
   * container is "in effect" typically requires a DB read
   * (BackupToolSettings).
   */
  describe(): Promise<EngineDescription>;
}
