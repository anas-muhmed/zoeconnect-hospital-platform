import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BackupToolSettings, BACKUP_TOOL_SETTINGS_SINGLETON_ID } from '../entities/backup-tool-settings.entity';
import { AuditService } from '../../audit/audit.service';

/** User-facing message shown wherever a raw `spawn ENOENT` would otherwise leak (job errorMessage, notifications, ...). Never change this string's meaning without updating the E2E-visible copy in the frontend job-detail view. */
export const PG_TOOLS_NOT_CONFIGURED_MESSAGE =
  'PostgreSQL client tools are not configured. Configure pg_dump and pg_restore from Backup \u2192 Settings \u2192 Database Tools.';

export interface PgToolsSettingsView {
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  detectedPgDumpPath: string | null;
  detectedPgRestorePath: string | null;
  detectedVersion: string | null;
  lastTestedAt: Date | null;
  lastTestStatus: 'success' | 'failure' | null;
  lastTestMessage: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
  executionMode: 'auto' | 'local' | 'docker' | 'remote' | 'bundled';
  dockerContainerName: string | null;
  detectedDockerContainerName: string | null;
  /** What resolvePgDumpPath()/resolvePgRestorePath() would currently return, and which resolution-order source it came from -- purely informational, for the UI. */
  effective: { pgDumpPath: string; pgRestorePath: string; pgDumpSource: PathSource; pgRestoreSource: PathSource };
}

export type PathSource = 'configured' | 'detected' | 'env' | 'default';

export interface DetectInstallationsResult {
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  version: string | null;
  candidates: string[];
}

export interface TestConfigurationResult {
  ok: boolean;
  pgDumpVersion?: string;
  pgRestoreVersion?: string;
  compatible?: boolean;
  message: string;
}

/**
 * PgToolsService — resolves, auto-detects, and tests the `pg_dump`/
 * `pg_restore` binary paths used by PgDumpService, replacing the old
 * "admin hand-edits PG_DUMP_PATH/.env and restarts the app" flow with a
 * UI-configurable, database-persisted (`backup_tool_settings`, a singleton
 * row) setting.
 *
 * Resolution order for both resolvePgDumpPath() and resolvePgRestorePath()
 * (exactly, per spec):
 *   1. Admin-configured value saved via PUT /backups/settings/pg-tools
 *      (`backup_tool_settings.pg_dump_path` / `.pg_restore_path`).
 *   2. Most recent auto-detected installation, CACHED in the same row
 *      (`.detected_pg_dump_path` / `.detected_pg_restore_path`) by the last
 *      detectInstallations() run -- so a backup/restore never re-scans the
 *      filesystem on every job, only when "Detect" is explicitly run (or
 *      the best-effort scan in the CreateBackupToolSettings migration / the
 *      provision-self-hosted installer hook populated it once).
 *   3. `PG_DUMP_PATH`/`PG_RESTORE_PATH` env vars -- legacy fallback, kept
 *      working for backward compatibility with any existing self-hosted
 *      install that already sets these; deliberately deprioritized below
 *      the DB-persisted settings so a UI save always wins.
 *   4. Bare `pg_dump`/`pg_restore` (today's original default) -- relies on
 *      the process's PATH.
 *
 * Every method here follows BackupStorageConfigService.testConnection()'s
 * "never throw, return a structured result, audit-log the outcome without
 * ever logging secrets" pattern -- there ARE no secrets in a filesystem
 * path, but the "never throw" contract still matters because callers
 * (PgDumpService, the controller) must be able to treat a bad/missing path
 * as data, not an exception.
 */
@Injectable()
export class PgToolsService {
  private readonly logger = new Logger(PgToolsService.name);

  constructor(
    @InjectRepository(BackupToolSettings) private readonly repo: Repository<BackupToolSettings>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // ── Row access ────────────────────────────────────────────────────────────

  private async getRow(): Promise<BackupToolSettings | null> {
    return this.repo.findOne({ where: { id: BACKUP_TOOL_SETTINGS_SINGLETON_ID } });
  }

  private async getOrCreateRow(): Promise<BackupToolSettings> {
    const existing = await this.getRow();
    if (existing) return existing;
    const created = this.repo.create({ id: BACKUP_TOOL_SETTINGS_SINGLETON_ID });
    return this.repo.save(created);
  }

  // ── Resolution (used by PgDumpService on every dump/restore) ────────────────

  async resolvePgDumpPath(): Promise<string> {
    const row = await this.getRow();
    if (row?.pgDumpPath) return row.pgDumpPath;
    if (row?.detectedPgDumpPath) return row.detectedPgDumpPath;
    const envPath = process.env.PG_DUMP_PATH || this.configService.get<string>('backup.pgDumpPath');
    if (envPath && envPath !== 'pg_dump') return envPath;
    return 'pg_dump';
  }

  async resolvePgRestorePath(): Promise<string> {
    const row = await this.getRow();
    if (row?.pgRestorePath) return row.pgRestorePath;
    if (row?.detectedPgRestorePath) return row.detectedPgRestorePath;
    const envPath = process.env.PG_RESTORE_PATH || this.configService.get<string>('backup.pgRestorePath');
    if (envPath && envPath !== 'pg_restore') return envPath;
    return 'pg_restore';
  }

  private async resolveWithSource(kind: 'dump' | 'restore'): Promise<{ value: string; source: PathSource }> {
    const row = await this.getRow();
    const configured = kind === 'dump' ? row?.pgDumpPath : row?.pgRestorePath;
    if (configured) return { value: configured, source: 'configured' };
    const detected = kind === 'dump' ? row?.detectedPgDumpPath : row?.detectedPgRestorePath;
    if (detected) return { value: detected, source: 'detected' };
    const envVal = kind === 'dump' ? process.env.PG_DUMP_PATH : process.env.PG_RESTORE_PATH;
    const configuredDefault = kind === 'dump'
      ? this.configService.get<string>('backup.pgDumpPath')
      : this.configService.get<string>('backup.pgRestorePath');
    const legacy = envVal || (configuredDefault !== 'pg_dump' && configuredDefault !== 'pg_restore' ? configuredDefault : undefined);
    if (legacy) return { value: legacy, source: 'env' };
    return { value: kind === 'dump' ? 'pg_dump' : 'pg_restore', source: 'default' };
  }

  // ── Read/save (controller-facing) ────────────────────────────────────────

  async getSettings(): Promise<PgToolsSettingsView> {
    const row = await this.getRow();
    const [dump, restore] = await Promise.all([this.resolveWithSource('dump'), this.resolveWithSource('restore')]);
    return {
      pgDumpPath: row?.pgDumpPath ?? null,
      pgRestorePath: row?.pgRestorePath ?? null,
      detectedPgDumpPath: row?.detectedPgDumpPath ?? null,
      detectedPgRestorePath: row?.detectedPgRestorePath ?? null,
      detectedVersion: row?.detectedVersion ?? null,
      lastTestedAt: row?.lastTestedAt ?? null,
      lastTestStatus: row?.lastTestStatus ?? null,
      lastTestMessage: row?.lastTestMessage ?? null,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
      executionMode: row?.executionMode ?? 'auto',
      dockerContainerName: row?.dockerContainerName ?? null,
      detectedDockerContainerName: row?.detectedDockerContainerName ?? null,
      effective: {
        pgDumpPath: dump.value, pgDumpSource: dump.source,
        pgRestorePath: restore.value, pgRestoreSource: restore.source,
      },
    };
  }

  /**
   * Saves the admin-configured paths (resolution order step 1), then runs
   * testConfiguration() as part of the save flow and persists the result
   * (lastTestedAt/lastTestStatus/lastTestMessage) -- per spec, test results
   * are only persisted via this save flow, never on a raw POST /test call.
   */
  async saveSettings(
    pgDumpPath: string,
    pgRestorePath: string,
    actorId?: string,
    executionMode?: 'auto' | 'local' | 'docker' | 'remote' | 'bundled',
    dockerContainerName?: string,
  ): Promise<PgToolsSettingsView> {
    const row = await this.getOrCreateRow();
    const testResult = await this.testConfiguration(pgDumpPath, pgRestorePath);
    await this.repo.update(BACKUP_TOOL_SETTINGS_SINGLETON_ID, {
      pgDumpPath,
      pgRestorePath,
      lastTestedAt: new Date(),
      lastTestStatus: testResult.ok ? 'success' : 'failure',
      lastTestMessage: testResult.message,
      updatedBy: actorId ?? row.updatedBy ?? null,
      ...(executionMode !== undefined && { executionMode }),
      ...(dockerContainerName !== undefined && { dockerContainerName }),
    });
    await this.auditService.log({
      action: 'BACKUP_PG_TOOLS_SETTINGS_UPDATED', module: 'BACKUP', entityType: 'backup_tool_settings', entityId: BACKUP_TOOL_SETTINGS_SINGLETON_ID,
      userId: actorId, metadata: { pgDumpPath, pgRestorePath, testOk: testResult.ok, executionMode, dockerContainerName },
    });
    return this.getSettings();
  }

  // ── Detect ────────────────────────────────────────────────────────────────

  /**
   * Searches common PostgreSQL client-tools install locations and, if
   * found, caches the highest-version result into the row's detected_*
   * columns (resolution order step 2) -- does NOT touch pgDumpPath/
   * pgRestorePath (the admin-configured columns), so this never silently
   * overrides an explicit save. Never throws.
   */
  async detectInstallations(): Promise<DetectInstallationsResult> {
    const isWindows = process.platform === 'win32';
    const dumpExe = isWindows ? 'pg_dump.exe' : 'pg_dump';
    const restoreExe = isWindows ? 'pg_restore.exe' : 'pg_restore';
    const candidateDirs: string[] = [];

    try {
      if (isWindows) {
        for (const base of ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']) {
          candidateDirs.push(...this.listVersionedBinDirs(base));
        }
        candidateDirs.push(...(await this.listRegistryBinDirs()));
      } else {
        candidateDirs.push('/usr/bin', '/usr/local/bin');
        candidateDirs.push(...this.listVersionedBinDirs('/usr/lib/postgresql'));
      }
    } catch (err) {
      this.logger.warn(`detectInstallations(): error enumerating candidate directories: ${(err as Error).message}`);
    }

    const candidates: string[] = [];
    let best: { pgDumpPath: string; pgRestorePath: string; version: string | null } | null = null;

    for (const dir of candidateDirs) {
      try {
        const dumpPath = path.join(dir, dumpExe);
        const restorePath = path.join(dir, restoreExe);
        const dumpOk = fs.existsSync(dumpPath) && this.isExecutable(dumpPath);
        const restoreOk = fs.existsSync(restorePath) && this.isExecutable(restorePath);
        if (dumpOk && restoreOk) {
          candidates.push(dir);
          if (!best) best = { pgDumpPath: dumpPath, pgRestorePath: restorePath, version: this.versionFromDirName(dir) };
        }
      } catch {
        // Unreadable/inaccessible candidate dir -- skip, never throw.
      }
    }

    if (best) {
      // Prefer a version parsed by actually running --version over the
      // directory-name guess, when available.
      const versionCheck = await this.runVersionCheck(best.pgDumpPath);
      const version = versionCheck.ok && versionCheck.version ? versionCheck.version : best.version;
      await this.getOrCreateRow();
      await this.repo.update(BACKUP_TOOL_SETTINGS_SINGLETON_ID, {
        detectedPgDumpPath: best.pgDumpPath,
        detectedPgRestorePath: best.pgRestorePath,
        detectedVersion: version,
      });
      await this.auditService.log({
        action: 'BACKUP_PG_TOOLS_DETECTED', module: 'BACKUP', entityType: 'backup_tool_settings', entityId: BACKUP_TOOL_SETTINGS_SINGLETON_ID,
        metadata: { pgDumpPath: best.pgDumpPath, pgRestorePath: best.pgRestorePath, version, candidateCount: candidates.length },
      });
      return { pgDumpPath: best.pgDumpPath, pgRestorePath: best.pgRestorePath, version, candidates };
    }

    return { pgDumpPath: null, pgRestorePath: null, version: null, candidates };
  }

  private listVersionedBinDirs(base: string): string[] {
    try {
      if (!fs.existsSync(base)) return [];
      const versions = fs.readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d+(\.\d+)?$/.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => parseFloat(b) - parseFloat(a)); // highest version first
      return versions.map((v) => path.join(base, v, 'bin'));
    } catch {
      return [];
    }
  }

  /**
   * Windows-only, additive: queries the registry for PostgreSQL install
   * locations recorded by the official installer
   * (`HKLM\SOFTWARE\PostgreSQL\Installations`, each sub-key has a "Base
   * Directory" value), which catches installs in non-default locations
   * that the `Program Files` directory scan above would miss. Best-effort
   * -- `reg.exe` missing, the key not existing, or any parse failure is
   * NOT an error, just an empty result; never throws, never breaks the
   * existing Program Files scan.
   */
  private listRegistryBinDirs(): Promise<string[]> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn('reg', ['query', 'HKLM\\SOFTWARE\\PostgreSQL\\Installations', '/s']);
      } catch {
        resolve([]);
        return;
      }

      let out = '';
      let settled = false;
      const finish = (dirs: string[]) => {
        if (settled) return;
        settled = true;
        resolve(dirs);
      };

      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        finish([]);
      }, 5000);

      child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
      child.on('error', () => { clearTimeout(timeout); finish([]); });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) { finish([]); return; }
        try {
          const dirs: string[] = [];
          const matches = out.matchAll(/Base Directory\s+REG_SZ\s+(.+)/g);
          for (const m of matches) {
            const baseDir = m[1].trim();
            if (baseDir) dirs.push(path.join(baseDir, 'bin'));
          }
          finish(dirs);
        } catch {
          finish([]);
        }
      });
    });
  }

  private versionFromDirName(dir: string): string | null {
    const match = dir.match(/[\\/](\d+(?:\.\d+)?)[\\/]bin$/);
    return match ? match[1] : null;
  }

  /** POSIX: real executable-bit check. Windows: existence only (exe permission bits aren't meaningful there). */
  private isExecutable(filePath: string): boolean {
    if (process.platform === 'win32') return true;
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ── Test configuration ───────────────────────────────────────────────────

  /**
   * Spawns `<path> --version` for both binaries and parses the version
   * string. Never throws -- catches spawn ENOENT and any other error and
   * returns a clean { ok: false, message } result, exactly like
   * BackupStorageConfigService.testConnection()'s contract.
   */
  async testConfiguration(pgDumpPath: string, pgRestorePath: string): Promise<TestConfigurationResult> {
    const [dumpCheck, restoreCheck] = await Promise.all([
      this.runVersionCheck(pgDumpPath),
      this.runVersionCheck(pgRestorePath),
    ]);

    if (!dumpCheck.ok) {
      return { ok: false, message: `pg_dump executable not found or not runnable at "${pgDumpPath}": ${dumpCheck.error}` };
    }
    if (!restoreCheck.ok) {
      return { ok: false, message: `pg_restore executable not found or not runnable at "${pgRestorePath}": ${restoreCheck.error}` };
    }

    const compatible = !!dumpCheck.version && !!restoreCheck.version && dumpCheck.version === restoreCheck.version;
    const message = compatible
      ? `pg_dump ${dumpCheck.version} and pg_restore ${restoreCheck.version} found and compatible.`
      : `pg_dump ${dumpCheck.version ?? 'unknown'} and pg_restore ${restoreCheck.version ?? 'unknown'} found, but versions do not match -- this can cause restore failures.`;

    return {
      ok: true,
      pgDumpVersion: dumpCheck.version ?? undefined,
      pgRestoreVersion: restoreCheck.version ?? undefined,
      compatible,
      message,
    };
  }

  /** Runs `<execPath> --version` and parses e.g. "pg_dump (PostgreSQL) 17.4" -> "17.4". Never throws. */
  private runVersionCheck(execPath: string): Promise<{ ok: boolean; version: string | null; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; version: string | null; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(execPath, ['--version']);
      } catch (err) {
        finish({ ok: false, version: null, error: (err as Error).message });
        return;
      }

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        const friendly = err.code === 'ENOENT' ? 'no such file or not executable' : err.message;
        finish({ ok: false, version: null, error: friendly });
      });
      child.on('close', (code) => {
        if (code !== 0) {
          finish({ ok: false, version: null, error: stderr.trim() || `exited with code ${code}` });
          return;
        }
        const version = this.parseVersionString(stdout);
        finish({ ok: true, version });
      });
    });
  }

  /** "pg_dump (PostgreSQL) 17.4" / "pg_restore (PostgreSQL) 16.2 (Ubuntu ...)" -> "17.4" / "16.2". */
  private parseVersionString(raw: string): string | null {
    const match = raw.match(/(\d+(?:\.\d+)+)/) || raw.match(/\s(\d+)\s*(?:\(|$)/);
    return match ? match[1] : null;
  }
}
