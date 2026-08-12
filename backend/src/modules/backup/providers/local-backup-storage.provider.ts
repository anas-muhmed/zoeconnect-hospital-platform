import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  IBackupStorageProvider, BackupStorageProviderMetadata, BackupStorageTestConnectionResult, BackupStorageCapacity,
} from './backup-storage-provider.interface';

/**
 * Local-filesystem IBackupStorageProvider. Streams directly to/from disk
 * (fs.createWriteStream/createReadStream) -- never buffers a whole archive
 * in memory, mirroring LocalStorageProvider's approach but with a stream-in/
 * stream-out contract instead of Buffer-in/Buffer-out.
 *
 * Root directory is `backup.localBackupDir` (default `<cwd>/backups`),
 * deliberately separate from the object-repository's `<cwd>/uploads` tree --
 * see the interface file's doc comment for why.
 */
@Injectable()
export class LocalBackupStorageProvider implements IBackupStorageProvider, OnModuleInit {
  readonly driver = 'local';
  readonly displayName = 'Local Filesystem';

  private readonly logger = new Logger(LocalBackupStorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private get rootDir(): string {
    return this.configService.get<string>('backup.localBackupDir') || path.join(process.cwd(), 'backups');
  }

  /**
   * Production incident follow-up (2026-08 audit): fails fast at boot when
   * the currently-configured DEFAULT backup driver is 'local' but
   * `rootDir` is not actually backed by a distinct volume/mount --
   * otherwise this reproduces the exact "uploaded media disappears after
   * deployment" bug for backup archives instead: they'd write successfully,
   * `testConnection()` would report healthy, and the operator would only
   * discover the loss the day they actually needed a restore.
   *
   * This only validates the module-wide DEFAULT driver
   * (`backup.defaultStorageDriver`) -- per-destination drivers chosen later
   * via `BackupStorageConfig` rows are validated live by
   * `testConnection()`/`getCapacity()` when that destination is used, which
   * is out of scope for a one-time boot check. Scoped this way because the
   * reported gap is specifically "an operator who never explicitly
   * configures a remote destination silently gets ephemeral local storage."
   */
  onModuleInit(): void {
    const driver = this.configService.get<string>('backup.defaultStorageDriver') || 'local';
    if (driver !== 'local') return;

    const dir = this.rootDir;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      // Can't even create the directory -- testConnection()/getCapacity()
      // will surface this clearly to an admin who tries to use it; don't
      // duplicate that here, but don't silently skip the persistence check
      // either -- log so it's visible in boot logs.
      this.logger.error(`Local backup directory "${dir}" could not be created: ${(err as Error).message}`);
      return;
    }

    const persistent = this.isLikelyPersistentMount(dir);
    if (persistent === false) {
      const message =
        `Local backup storage is the active default driver, but "${dir}" does not appear to be a ` +
        `persistent volume/mount -- it is on the same filesystem as the container/host root. Backup ` +
        `archives written here will be LOST on next deployment or container replacement, exactly like ` +
        `the CMS uploads-persistence incident this check was added after. Fix: mount a persistent ` +
        `volume at "${dir}" (see docker-compose.yml's hdsp_backups volume), or point BACKUP_LOCAL_DIR ` +
        `at one, or configure a remote destination (S3/Azure/GCS/SFTP/network share) instead.`;
      if (this.configService.get<boolean>('backup.requirePersistentLocalBackupDir')) {
        throw new Error(
          `${message} Set BACKUP_REQUIRE_PERSISTENT_LOCAL_DIR=false to start anyway (not recommended in production).`,
        );
      }
      this.logger.error(`${message} Continuing to start because BACKUP_REQUIRE_PERSISTENT_LOCAL_DIR=false.`);
    } else if (persistent === null) {
      this.logger.warn(
        `Could not verify whether local backup directory "${dir}" is a persistent volume/mount on this ` +
        `platform (${process.platform}) -- skipping the boot-time persistence check. Verify manually that ` +
        `this path survives a deployment/container replacement.`,
      );
    }
  }

  /**
   * Heuristic: on POSIX, a real bind-mount or named volume has a different
   * device number (`st_dev`) than the filesystem its parent directory lives
   * on. A plain directory created inside the container's own writable layer
   * shares the same device as everything else in that layer. This is the
   * same signal `df`/`mountpoint` rely on, without shelling out. Not
   * available on Windows (no equivalent Node API); returns `null` there
   * (unverifiable, not "not persistent") -- the Windows installer path
   * (%PROGRAMDATA%) is a real host directory by construction, not a
   * container layer, so the risk this check targets doesn't apply there.
   */
  private isLikelyPersistentMount(dir: string): boolean | null {
    if (process.platform === 'win32') return null;
    try {
      const dirDev = fs.statSync(dir).dev;
      const parentDev = fs.statSync(path.dirname(dir)).dev;
      // If dir's device differs from its own parent's device, something is
      // mounted exactly at `dir` -- unambiguously persistent.
      if (dirDev !== parentDev) return true;
      // Otherwise, compare against the filesystem root. If they still
      // match, `dir` lives on the same filesystem as the whole container
      // (or host, outside Docker) -- not a distinct mount.
      const rootDev = fs.statSync('/').dev;
      return dirDev !== rootDev;
    } catch (err) {
      this.logger.warn(`Persistent-mount check failed for "${dir}": ${(err as Error).message}`);
      return null;
    }
  }

  private resolve(key: string): string {
    // Defensive: reject any key that would escape rootDir via '..' traversal.
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir))) {
      throw new Error(`Backup storage key escapes root directory: ${key}`);
    }
    return full;
  }

  async uploadStream(key: string, source: Readable, _sizeHint?: number): Promise<void> {
    const dest = this.resolve(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const writeStream = fs.createWriteStream(dest);
    await pipeline(source, writeStream);
    this.logger.log(`Backup archive written -> ${dest}`);
  }

  async downloadStream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    if (!fs.existsSync(full)) {
      throw new NotFoundException(`Backup archive not found at key: ${key}`);
    }
    return fs.createReadStream(full);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolve(key));
  }

  async getMetadata(key: string): Promise<BackupStorageProviderMetadata> {
    const full = this.resolve(key);
    const stat = await fs.promises.stat(full);
    return { key, sizeBytes: stat.size, lastModified: stat.mtime };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    try {
      await fs.promises.unlink(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }

  async list(prefix: string): Promise<BackupStorageProviderMetadata[]> {
    const dir = this.resolve(prefix);
    if (!fs.existsSync(dir)) return [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const results: BackupStorageProviderMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      const stat = await fs.promises.stat(full);
      results.push({ key: path.join(prefix, entry.name), sizeBytes: stat.size, lastModified: stat.mtime });
    }
    return results;
  }

  async getDownloadUrl(_key: string, _expirationSeconds?: number): Promise<string> {
    throw new Error('LocalBackupStorageProvider does not support pre-signed URLs; use the streaming download endpoint instead.');
  }

  /**
   * Real connectivity/permissions probe: writes a small marker file under
   * rootDir, reads it back, then deletes it. Covers the "external USB /
   * mounted NAS path" case too -- those are just paths from Node's
   * perspective, so this exercises exactly the same fs calls
   * uploadStream()/downloadStream()/delete() use. Never throws -- any
   * failure (missing/unwritable path, permissions, drive not mounted)
   * resolves as `{ ok: false, message }`.
   */
  async testConnection(): Promise<BackupStorageTestConnectionResult> {
    const markerName = `.zoeconnect-test-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    const markerPath = this.resolve(markerName);
    try {
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      const payload = `zoeconnect-backup-connection-test ${new Date().toISOString()}`;
      await fs.promises.writeFile(markerPath, payload, 'utf8');
      const readBack = await fs.promises.readFile(markerPath, 'utf8');
      await fs.promises.unlink(markerPath);
      if (readBack !== payload) {
        return { ok: false, message: 'Write/read round-trip returned different bytes than were written.' };
      }
      return { ok: true, message: `Write, read, and delete all succeeded at ${this.rootDir}`, details: { rootDir: this.rootDir } };
    } catch (err) {
      await fs.promises.unlink(markerPath).catch(() => undefined);
      return { ok: false, message: `Local backup destination is not writable: ${(err as Error).message}`, details: { rootDir: this.rootDir } };
    }
  }

  /**
   * Best-effort real disk-space reporting.
   *
   * POSIX (Linux/macOS): Node's `fs.statfsSync` reports real free/total
   * bytes for the filesystem rootDir lives on -- used directly.
   *
   * Windows: Node's `fs` module has no statfs equivalent. Rather than guess,
   * this shells out to `wmic logicaldisk get ... /format:csv` for the drive
   * letter rootDir is on, with a short timeout (documented choice per the
   * storage-hardening brief: either shell out with a safe fallback, or
   * return null with an explanatory message -- this implementation does
   * both, shelling out first and falling back to the null/message shape on
   * any failure, e.g. `wmic` deprecated/removed on newer Windows builds, a
   * UNC/mapped-drive path wmic can't resolve, or the process exceeding the
   * timeout).
   */
  async getCapacity(): Promise<BackupStorageCapacity> {
    const usedByBackupsBytes = null; // filled in by the caller (has DB access); see interface doc comment.
    if (!fs.existsSync(this.rootDir)) {
      return {
        availableBytes: null, totalBytes: null, usedByBackupsBytes,
        healthy: false, message: `Backup directory does not exist yet: ${this.rootDir}`,
      };
    }
    try {
      if (process.platform === 'win32') {
        const stats = this.getWindowsDiskSpace(this.rootDir);
        if (!stats) {
          return {
            availableBytes: null, totalBytes: null, usedByBackupsBytes,
            healthy: true, message: 'Disk space unavailable on this platform',
          };
        }
        return { ...stats, usedByBackupsBytes, healthy: true };
      }
      // POSIX
      const statfs = (fs as typeof fs & { statfsSync?: (p: string) => { bavail: number; bsize: number; blocks: number } }).statfsSync;
      if (!statfs) {
        return {
          availableBytes: null, totalBytes: null, usedByBackupsBytes,
          healthy: true, message: 'Disk space unavailable on this platform',
        };
      }
      const stat = statfs(this.rootDir);
      return {
        availableBytes: stat.bavail * stat.bsize,
        totalBytes: stat.blocks * stat.bsize,
        usedByBackupsBytes,
        healthy: true,
      };
    } catch (err) {
      return {
        availableBytes: null, totalBytes: null, usedByBackupsBytes,
        healthy: false, message: `Failed to read disk space: ${(err as Error).message}`,
      };
    }
  }

  private getWindowsDiskSpace(dir: string): { availableBytes: number; totalBytes: number } | null {
    try {
      const driveLetter = path.parse(path.resolve(dir)).root.replace(/[\\/]/g, ''); // e.g. "C:"
      if (!driveLetter) return null;
      // /format:csv keeps this parseable without locale-dependent column spacing.
      const output = execFileSync(
        'wmic',
        ['logicaldisk', 'where', `DeviceID='${driveLetter}'`, 'get', 'FreeSpace,Size', '/format:csv'],
        { timeout: 4000, windowsHide: true, encoding: 'utf8' },
      );
      const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // CSV header is "Node,FreeSpace,Size"; data row follows.
      const dataLine = lines.find((l) => l.includes(',') && !l.toLowerCase().startsWith('node,'));
      if (!dataLine) return null;
      const parts = dataLine.split(',');
      const freeSpace = Number(parts[1]);
      const size = Number(parts[2]);
      if (!Number.isFinite(freeSpace) || !Number.isFinite(size)) return null;
      return { availableBytes: freeSpace, totalBytes: size };
    } catch (err) {
      this.logger.warn(`Windows disk-space lookup via wmic failed, falling back to null: ${(err as Error).message}`);
      return null;
    }
  }
}
