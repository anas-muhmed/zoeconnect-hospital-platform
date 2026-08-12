import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { PgToolsService, PG_TOOLS_NOT_CONFIGURED_MESSAGE } from './pg-tools.service';
import { IPgExecutionStrategy, TestConfigurationResult, EngineDescription } from './pg-execution-strategy.interface';

/**
 * PgDumpService — shells out to the real `pg_dump`/`pg_restore` binaries
 * (custom format, `-Fc`) as child processes, per the spec's explicit
 * instruction not to reimplement a Postgres dumper in JS. Connection
 * details are read from the same `database.*` config namespace TypeORM
 * itself uses (`database.config.ts`), so this always targets the exact
 * database the running app is connected to.
 *
 * Both directions stream: `dumpDatabase()`'s returned Readable is `pg_dump`'s
 * stdout piped straight through (never buffered), and `restoreDatabase()`
 * pipes its `source` Readable straight into `pg_restore`'s stdin. Neither
 * method holds the whole dump in memory — the intermediate
 * compression/encryption/storage stages are what sit between them in
 * BackupArchiveService/RestoreService's pipe chains.
 *
 * Binary path resolution is delegated entirely to PgToolsService
 * (resolvePgDumpPath()/resolvePgRestorePath()) rather than reading
 * `backup.pgDumpPath`/`backup.pgRestorePath` off ConfigService directly --
 * see PgToolsService's doc comment for the full resolution order (UI-saved
 * setting > cached auto-detect > legacy env var > bare command). This is
 * also the single choke point for the "never let a raw spawn ENOENT reach a
 * user-facing surface" requirement: both dumpDatabase() and
 * restoreDatabase() pre-flight-check an absolute resolved path with
 * fs.existsSync() before spawning, and translate a spawn-time ENOENT (the
 * case a bare/PATH-relative command can't be pre-checked for) into
 * PG_TOOLS_NOT_CONFIGURED_MESSAGE either way -- callers (BackupService's
 * stageDatabase(), RestoreService's restore/rollback call sites) never see
 * the raw OS error.
 *
 * Also directly implements IPgExecutionStrategy (rather than being wrapped
 * by a separate LocalPgExecutionStrategy class) -- its 3 core methods
 * already match the interface exactly, and testConfiguration()/describe()
 * are thin additions on top of PgToolsService's existing logic. This is the
 * strategy PgEngineService resolves to for the "local" mode.
 */
@Injectable()
export class PgDumpService implements IPgExecutionStrategy {
  private readonly logger = new Logger(PgDumpService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pgToolsService: PgToolsService,
  ) {}

  /**
   * Pre-flight existence check for BEFORE spawning. Only meaningful for an
   * absolute/path-shaped value (an admin-configured or auto-detected path)
   * -- a bare command like "pg_dump" relies on the process PATH and can't
   * be existsSync-checked, so this returns null (no error) for that case
   * and relies on the spawn 'error' handler's ENOENT translation instead.
   */
  private preflightMissing(execPath: string): boolean {
    const looksLikeAPath = path.isAbsolute(execPath) || execPath.includes('/') || execPath.includes('\\');
    if (!looksLikeAPath) return false;
    return !fs.existsSync(execPath);
  }

  private isNotFoundError(err: NodeJS.ErrnoException): boolean {
    return err.code === 'ENOENT';
  }

  private connectionEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGPASSWORD: this.configService.get<string>('database.password') || '',
    };
  }

  private connectionArgs(): string[] {
    return [
      '-h', this.configService.get<string>('database.host') || 'localhost',
      '-p', String(this.configService.get<number>('database.port') || 5432),
      '-U', this.configService.get<string>('database.user') || 'postgres',
      '-d', this.configService.get<string>('database.name') || 'postgres',
    ];
  }

  /**
   * Returns a Readable streaming `pg_dump`'s stdout (custom format, `-Fc`,
   * suitable for `pg_restore`). If the child process fails or exits
   * non-zero, the returned stream emits an 'error' event (rather than
   * throwing synchronously) since failures on a real dump typically surface
   * mid-stream, not before the first byte.
   */
  async dumpDatabase(): Promise<Readable> {
    const pgDumpPath = await this.pgToolsService.resolvePgDumpPath();
    const output = new PassThrough();

    if (this.preflightMissing(pgDumpPath)) {
      this.logger.error(`pg_dump not found at configured/detected path "${pgDumpPath}" -- aborting before spawn.`);
      process.nextTick(() => output.destroy(new Error(PG_TOOLS_NOT_CONFIGURED_MESSAGE)));
      return output;
    }

    const args = [...this.connectionArgs(), '-Fc', '--no-owner', '--no-privileges'];
    this.logger.log(`Starting pg_dump (${pgDumpPath} -h *** -d ${args[args.length - 1] ?? ''})`);

    const child = spawn(pgDumpPath, args, { env: this.connectionEnv() });
    let stderrBuf = Buffer.alloc(0);

    child.stdout.pipe(output);
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      output.destroy(this.isNotFoundError(err) ? new Error(PG_TOOLS_NOT_CONFIGURED_MESSAGE) : err);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        output.destroy(new Error(`pg_dump exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
      }
    });

    return output;
  }

  /**
   * Pipes `source` into `pg_restore`'s stdin against the CURRENT database
   * (never a different one — RestoreService is responsible for having
   * already confirmed this is the intended target). Uses `--clean
   * --if-exists` so restoring drops/recreates conflicting objects rather
   * than failing on "already exists", and `--no-owner --no-privileges` to
   * avoid failing on role mismatches between the backup source and this
   * environment.
   */
  async restoreDatabase(source: Readable): Promise<void> {
    const pgRestorePath = await this.pgToolsService.resolvePgRestorePath();

    if (this.preflightMissing(pgRestorePath)) {
      this.logger.error(`pg_restore not found at configured/detected path "${pgRestorePath}" -- aborting before spawn.`);
      throw new Error(PG_TOOLS_NOT_CONFIGURED_MESSAGE);
    }

    const args = [...this.connectionArgs(), '--clean', '--if-exists', '--no-owner', '--no-privileges'];
    this.logger.log(`Starting pg_restore (${pgRestorePath})`);

    return new Promise<void>((resolve, reject) => {
      const child = spawn(pgRestorePath, args, { env: this.connectionEnv() });
      let stderrBuf = Buffer.alloc(0);

      child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        reject(this.isNotFoundError(err) ? new Error(PG_TOOLS_NOT_CONFIGURED_MESSAGE) : err);
      });
      child.on('close', (code) => {
        // pg_restore commonly exits non-zero on non-fatal warnings (e.g.
        // "already exists" for objects --clean couldn't drop cleanly); a
        // production implementation would parse stderr more precisely.
        // Treated as fatal here — a partially-restored database must not
        // be silently accepted as success (spec: "never silently partially
        // restore").
        if (code !== 0) {
          reject(new Error(`pg_restore exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
        } else {
          resolve();
        }
      });

      source.on('error', (err) => child.stdin.destroy(err as Error));
      source.pipe(child.stdin);
    });
  }

  /** Best-effort server version string (e.g. "16.2"), for manifest metadata + compatibility checks. */
  async getDatabaseVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const psqlArgs = [...this.connectionArgs(), '-tAc', 'SHOW server_version;'];
      const child = spawn('psql', psqlArgs, { env: this.connectionEnv() });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
      child.on('error', () => resolve(null));
      child.on('close', (code) => resolve(code === 0 ? out.trim() || null : null));
    });
  }

  /** IPgExecutionStrategy: resolves the current local paths and delegates to PgToolsService.testConfiguration(). Never throws. */
  async testConfiguration(): Promise<TestConfigurationResult> {
    const [pgDumpPath, pgRestorePath] = await Promise.all([
      this.pgToolsService.resolvePgDumpPath(),
      this.pgToolsService.resolvePgRestorePath(),
    ]);
    return this.pgToolsService.testConfiguration(pgDumpPath, pgRestorePath);
  }

  /** IPgExecutionStrategy: cheap, no-spawn description for the UI health card. */
  async describe(): Promise<EngineDescription> {
    const settings = await this.pgToolsService.getSettings();
    const source = settings.effective.pgDumpSource;
    const detectedAutomatically = source === 'detected';
    const location = source === 'configured'
      ? 'Custom (Advanced override)'
      : source === 'detected'
        ? 'Detected Automatically'
        : source === 'env'
          ? 'Legacy PG_DUMP_PATH/PG_RESTORE_PATH environment variable'
          : 'System PATH';
    return {
      mode: 'local',
      version: settings.detectedVersion ?? null,
      location,
      detectedAutomatically,
    };
  }
}
