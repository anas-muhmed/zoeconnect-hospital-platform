import { registerAs } from '@nestjs/config';
import * as path from 'path';

/**
 * Backup & Restore module configuration (registerAs('backup', ...)).
 *
 * Follows the same registerAs/env-var pattern as every other config file in
 * this codebase (see deployment.config.ts, redis.config.ts). Defaults are
 * chosen so an existing deployment that sets none of these vars gets a
 * conservative, safe-by-default local-disk backup setup (no encryption, no
 * secret-leaking env dump) rather than failing to boot.
 */
/**
 * OS-appropriate DEFAULT local backup directory, used only when
 * BACKUP_LOCAL_DIR is not set. Deliberately NOT process.cwd()-relative --
 * backup storage must survive an application reinstall/relocation, so it
 * lives in a dedicated OS data directory instead of inside the install dir:
 *   - Windows: %PROGRAMDATA%\ZoeConnect\Backups (falls back to the literal
 *     C:\ProgramData if PROGRAMDATA is somehow unset -- it always is on a
 *     real Windows install, but this keeps the function total rather than
 *     producing a broken path).
 *   - Linux/macOS: /var/lib/zoeconnect/backups, the conventional FHS
 *     location for a service's persistent variable data.
 * This mirrors installer/HDSP.iss's default local backup [Dirs] entry
 * ({commonappdata}\ZoeConnect\Backups) so the "never install-dir-relative"
 * rule holds whether the backend is launched by the Windows installer's
 * NSSM services or run directly (Linux/Docker self-hosted, local dev).
 */
function defaultLocalBackupDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'ZoeConnect', 'Backups');
  }
  return '/var/lib/zoeconnect/backups';
}

export const backupConfig = registerAs('backup', () => ({
  // Default IBackupStorageProvider driver a new BackupStorageConfig row
  // resolves to when no explicit driver is chosen at destination-creation
  // time. Actual per-destination driver selection lives in the
  // `backup_storage_configs` table, not here -- this is only the fallback.
  defaultStorageDriver: process.env.BACKUP_DEFAULT_STORAGE_DRIVER || 'local',

  // Root directory LocalBackupStorageProvider writes archives under.
  // Deliberately a distinct tree from the generic object-repository's
  // `<cwd>/uploads` (see LocalStorageProvider) -- backup archives are not
  // user-facing objects and must never be reachable via the same
  // static-file-serving path uploads are. Also deliberately NOT
  // process.cwd()-relative by default -- see defaultLocalBackupDir() above.
  localBackupDir: process.env.BACKUP_LOCAL_DIR || defaultLocalBackupDir(),

  // Production incident follow-up (2026-08 audit of the CMS media
  // persistence incident, same architectural class of bug): when the
  // active backup driver is 'local' but `localBackupDir` isn't actually
  // backed by a volume/mount distinct from the container's own writable
  // layer, backup archives are just as ephemeral as the pre-fix uploads
  // directory was -- gone on next deploy, with no error until the day a
  // restore is needed and nothing is there. `LocalBackupStorageProvider`
  // checks this at boot (POSIX: compares `statSync(rootDir).dev` against
  // the root filesystem's device -- a real mount has a different device
  // number). Defaults to enforced (fail startup) since a backup system
  // that can silently lose data is worse than one that refuses to start;
  // set BACKUP_REQUIRE_PERSISTENT_LOCAL_DIR=false only for local dev / any
  // environment where this heuristic doesn't apply.
  requirePersistentLocalBackupDir: process.env.BACKUP_REQUIRE_PERSISTENT_LOCAL_DIR !== 'false',

  // AES-256-GCM encryption-at-rest key for BackupStorageConfig credential
  // sub-fields (S3 secret key, SFTP password/private key, Azure connection
  // string, etc.) -- see BackupCredentialCipherService. Must be exactly 32
  // bytes once decoded; accepted as base64, hex, or raw utf8 (whichever
  // decodes to 32 bytes). Required in production the moment any destination
  // with real credentials is saved -- BackupCredentialCipherService fails
  // fast rather than silently persisting plaintext when this is unset.
  credentialsEncryptionKey: process.env.BACKUP_CREDENTIALS_ENCRYPTION_KEY || '',

  // Retention policy defaults (per-schedule rows can override both).
  retentionCount: parseInt(process.env.BACKUP_RETENTION_COUNT || '30', 10),
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '90', 10),

  // Compression is always on (streaming tar.gz) -- there is no "off" mode,
  // consistent with the spec's "compression: streaming tar.gz" requirement.
  // Kept as a config flag anyway so a future performance escape hatch (raw
  // tar, no gzip) doesn't require a schema change.
  compressionEnabled: process.env.BACKUP_COMPRESSION_ENABLED !== 'false',

  // AES-256-GCM archive encryption. Disabled by default -- opt-in per the
  // spec ("optional AES-256, password-protected"). When enabled here AND no
  // per-request passphrase is supplied, BackupEncryptionService falls back
  // to this passphrase; either way the derived key is never written into
  // the archive (see BackupEncryptionService's doc comment).
  encryptionEnabledByDefault: process.env.BACKUP_ENCRYPTION_ENABLED === 'true',
  encryptionPassphrase: process.env.BACKUP_ENCRYPTION_PASSPHRASE || '',

  // Env vars are excluded from every backup's configuration bundle unless
  // this is explicitly enabled -- per spec ("env vars excluding secrets
  // unless explicitly enabled"). Even when enabled, BackupService still
  // redacts a fixed deny-list of known-secret key name patterns (see
  // ENV_SECRET_KEY_PATTERNS in backup.service.ts) -- this flag controls
  // whether non-secret env vars are captured at all, not a blanket "include
  // literally everything" switch.
  includeEnvVars: process.env.BACKUP_INCLUDE_ENV_VARS === 'true',

  // pg_dump/pg_restore binaries (custom format, -Fc) -- shelled out to as
  // child processes rather than reimplemented in JS (spec requirement).
  //
  // DEPRECATED / LEGACY FALLBACK ONLY as of the Backup -> Settings ->
  // Database Tools UI: the actual path used by PgDumpService at runtime is
  // resolved by PgToolsService.resolvePgDumpPath()/resolvePgRestorePath(),
  // whose resolution order is (1) the admin-configured value saved via
  // PUT /backups/settings/pg-tools, persisted in the `backup_tool_settings`
  // DB table, (2) the most recent cached auto-detect result, (3) THESE env
  // vars, (4) the bare command below. PG_DUMP_PATH/PG_RESTORE_PATH are kept
  // working (not removed) purely for backward compatibility with any
  // existing self-hosted install that already sets them -- new installs
  // should use the UI instead of editing .env.
  pgDumpPath: process.env.PG_DUMP_PATH || 'pg_dump',
  pgRestorePath: process.env.PG_RESTORE_PATH || 'pg_restore',
  pgDumpTimeoutMs: parseInt(process.env.BACKUP_PG_DUMP_TIMEOUT_MS || '0', 10) || undefined,

  // Application version stamped into every manifest, and read back by
  // RestoreService's version-compatibility check. Falls back to
  // package.json's own version at build time when APP_VERSION is unset --
  // see backup-manifest.service.ts's resolveAppVersion().
  appVersion: process.env.APP_VERSION || '',

  // Version-compatibility gate for RestoreService.checkVersionCompatibility().
  // A backup whose app version's MAJOR component is below this value is
  // rejected outright as genuinely incompatible (spec: "block genuinely
  // incompatible restores, e.g. major version mismatch you define").
  minCompatibleAppVersion: process.env.BACKUP_MIN_COMPATIBLE_APP_VERSION || '1.0.0',

  // Timezone dynamic per-tenant CronJobs are registered with
  // (BackupSchedulerService / SchedulerRegistry).
  cronTimezone: process.env.BACKUP_CRON_TIMEZONE || 'UTC',

  // Which IDatabaseBackupProvider DatabaseBackupProviderRegistry resolves to
  // (point 8, "future-proof the provider model"). Only 'postgres' is
  // implemented today -- no `database.type` config key existed elsewhere in
  // this codebase to reuse (checked database.config.ts), so this is a new,
  // backup-module-scoped setting. Any other value throws a clear
  // "not yet supported" error rather than silently falling back.
  databaseType: process.env.BACKUP_DATABASE_TYPE || 'postgres',
}));
