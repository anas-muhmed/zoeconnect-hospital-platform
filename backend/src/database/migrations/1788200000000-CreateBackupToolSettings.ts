import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Backup Tools Settings — UI-configurable, database-persisted `pg_dump`/
 * `pg_restore` paths (follow-up to CreateBackupModule1788000000000 /
 * BackupStorageMultiDestinationAndEncryption1788100000000).
 *
 * A NEW migration rather than editing either prior backup migration in
 * place, per house rule.
 *
 * Creates `backup_tool_settings` -- a singleton row (see
 * BackupToolSettings entity doc comment for why this is its own small
 * table rather than reusing `system_settings`).
 *
 * Best-effort auto-detection on `up()`: this migration runs as real Node
 * code directly on the host at deploy time (same as every other migration
 * in this codebase), so `fs.existsSync` checks against real filesystem
 * paths work here exactly as they would in the running app. We use this to
 * pre-populate the row's `detected_*` cache columns (NOT the admin-facing
 * `pg_dump_path`/`pg_restore_path` columns -- those stay null until an
 * admin explicitly saves a value) if a PostgreSQL client-tools install is
 * found at one of the common locations, purely as a convenience so a fresh
 * install's Backup -> Settings -> Database Tools page isn't blank on first
 * view. Wrapped in try/catch so a detection failure (unreadable directory,
 * unexpected filesystem layout, anything) can NEVER fail the migration --
 * worst case the row simply has null detected_* columns, exactly as if
 * this block didn't run at all.
 *
 * This mirrors (deliberately does not duplicate/import, to keep migrations
 * self-contained and not depend on application source that may change
 * shape independently of the schema) the search logic in
 * PgToolsService.detectInstallations() -- see that service for the
 * authoritative, unit-tested version used by the running app. If the two
 * ever drift, this one only affects the pre-populated cache on a fresh
 * install; PgToolsService's own detection (run on demand via the "Detect
 * PostgreSQL Installation" button, or the provision-self-hosted script) is
 * always the source of truth for a live app.
 */
export class CreateBackupToolSettings1788200000000 implements MigrationInterface {
  name = 'CreateBackupToolSettings1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "backup_tool_settings" (
        "id"                        VARCHAR(40) NOT NULL,
        "pg_dump_path"              VARCHAR(1000),
        "pg_restore_path"           VARCHAR(1000),
        "detected_pg_dump_path"     VARCHAR(1000),
        "detected_pg_restore_path"  VARCHAR(1000),
        "detected_version"          VARCHAR(50),
        "last_tested_at"            TIMESTAMPTZ,
        "last_test_status"          VARCHAR(20),
        "last_test_message"         TEXT,
        "updated_by"                UUID,
        "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_backup_tool_settings" PRIMARY KEY ("id")
      );
    `);

    const detected = this.bestEffortDetect();
    if (detected) {
      await queryRunner.query(
        `INSERT INTO "backup_tool_settings"
           ("id", "detected_pg_dump_path", "detected_pg_restore_path", "detected_version", "updated_at")
         VALUES ('singleton', $1, $2, $3, NOW())
         ON CONFLICT ("id") DO UPDATE SET
           "detected_pg_dump_path" = EXCLUDED."detected_pg_dump_path",
           "detected_pg_restore_path" = EXCLUDED."detected_pg_restore_path",
           "detected_version" = EXCLUDED."detected_version",
           "updated_at" = NOW()`,
        [detected.pgDumpPath, detected.pgRestorePath, detected.version],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_tool_settings" CASCADE;`);
  }

  /**
   * Minimal, defensive, best-effort scan -- intentionally simpler than
   * PgToolsService.detectInstallations() (no version-string parsing via a
   * child process; migrations should stay fast and dependency-light). Never
   * throws; returns null on any error or if nothing is found.
   */
  private bestEffortDetect(): { pgDumpPath: string; pgRestorePath: string; version: string | null } | null {
    try {
      const isWindows = process.platform === 'win32';
      const dumpExe = isWindows ? 'pg_dump.exe' : 'pg_dump';
      const restoreExe = isWindows ? 'pg_restore.exe' : 'pg_restore';
      const candidateDirs: string[] = [];

      if (isWindows) {
        for (const base of ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']) {
          candidateDirs.push(...this.listVersionedBinDirs(base));
        }
      } else {
        candidateDirs.push('/usr/bin', '/usr/local/bin');
        candidateDirs.push(...this.listVersionedBinDirs('/usr/lib/postgresql'));
      }

      // Highest version first (listVersionedBinDirs already sorts descending);
      // plain fixed dirs (/usr/bin etc.) are checked last as a fallback.
      for (const dir of candidateDirs) {
        const dumpPath = path.join(dir, dumpExe);
        const restorePath = path.join(dir, restoreExe);
        if (fs.existsSync(dumpPath) && fs.existsSync(restorePath)) {
          return { pgDumpPath: dumpPath, pgRestorePath: restorePath, version: this.versionFromDirName(dir) };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Lists `<base>/<version>/bin` for every numeric version-named subdirectory of `base`, highest version first. */
  private listVersionedBinDirs(base: string): string[] {
    try {
      if (!fs.existsSync(base)) return [];
      const versions = fs.readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d+(\.\d+)?$/.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => parseFloat(b) - parseFloat(a));
      return versions.map((v) => path.join(base, v, 'bin'));
    } catch {
      return [];
    }
  }

  private versionFromDirName(dir: string): string | null {
    const match = dir.match(/[\\/](\d+(?:\.\d+)?)[\\/]bin$/);
    return match ? match[1] : null;
  }
}
