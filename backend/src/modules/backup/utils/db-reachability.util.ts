import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

const logger = new Logger('DbReachabilityCheck');

/**
 * Cheap, real connectivity probe against the app's OWN TypeORM DataSource
 * (not a fresh connection to whatever the backup/restore engine targets) --
 * used by BackupDiagnosticsService.runDiagnostics() and
 * RestoreService.checkRestoreReadiness() so both surfaces answer "is the
 * database this app is actually connected to reachable right now" the same
 * way, via one query, rather than duplicating a `SELECT 1` in two services.
 * Never throws -- returns false on any error.
 */
export async function isDatabaseReachable(dataSource: DataSource): Promise<boolean> {
  try {
    await dataSource.query('SELECT 1');
    return true;
  } catch (err) {
    logger.warn(`Database reachability check failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Best-effort, low-risk privilege heuristic -- NOT a real pg_dump/pg_restore
 * dry run (that would be expensive and itself risk side effects). Checks
 * whether the current DB role has CREATE privilege on the current database,
 * as a cheap proxy for "this role can plausibly do restore-like DDL". A
 * `true` result is not a guarantee a real restore will succeed; a `false`
 * result is a strong signal it won't. Never throws.
 */
export async function hasCreatePrivilegeHeuristic(dataSource: DataSource): Promise<boolean> {
  try {
    const rows = await dataSource.query<Array<{ has_create: boolean }>>(
      `SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS has_create`,
    );
    return !!rows?.[0]?.has_create;
  } catch (err) {
    logger.warn(`Permissions heuristic check failed: ${(err as Error).message}`);
    return false;
  }
}

/** `SELECT pg_database_size(current_database())` -- used for estimatedBackupSizeBytes. Never throws; returns null on failure. */
export async function getCurrentDatabaseSizeBytes(dataSource: DataSource): Promise<number | null> {
  try {
    const rows = await dataSource.query<Array<{ size: string }>>(`SELECT pg_database_size(current_database()) AS size`);
    const raw = rows?.[0]?.size;
    return raw !== undefined ? Number(raw) : null;
  } catch (err) {
    logger.warn(`pg_database_size check failed: ${(err as Error).message}`);
    return null;
  }
}
