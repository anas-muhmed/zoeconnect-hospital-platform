import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Readable, PassThrough } from 'stream';
import * as path from 'path';
import { IPgExecutionStrategy, TestConfigurationResult, EngineDescription } from './pg-execution-strategy.interface';

/**
 * BundledPgExecutionStrategy — for a future ZoeConnect distribution that
 * ships its own `pg_dump`/`pg_restore` binaries alongside the app (set via
 * the `BACKUP_BUNDLED_PG_DIR` env var). ZoeConnect does not currently ship
 * bundled Postgres binaries, so in practice this strategy is never selected
 * today -- but it's implemented fully (not a stub) so turning it on later is
 * just "set the env var", no code changes.
 *
 * Per spec: "If ZoeConnect ships with its own PostgreSQL distribution,
 * always use the bundled tools. Do not search the operating system." --
 * PgEngineService enforces the "always"/"skip search" part by checking
 * `BACKUP_BUNDLED_PG_DIR` first, before any local/Docker detection; this
 * class itself is just Local's shape hardcoded to that one directory with
 * no auto-detection of its own.
 */
export class BundledPgExecutionStrategy implements IPgExecutionStrategy {
  private readonly logger = new Logger(BundledPgExecutionStrategy.name);

  constructor(
    private readonly bundledDir: string,
    private readonly configService: ConfigService,
  ) {}

  private get pgDumpPath(): string {
    return path.join(this.bundledDir, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  }

  private get pgRestorePath(): string {
    return path.join(this.bundledDir, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
  }

  private get psqlPath(): string {
    return path.join(this.bundledDir, process.platform === 'win32' ? 'psql.exe' : 'psql');
  }

  private connectionEnv(): NodeJS.ProcessEnv {
    return { ...process.env, PGPASSWORD: this.configService.get<string>('database.password') || '' };
  }

  private connectionArgs(): string[] {
    return [
      '-h', this.configService.get<string>('database.host') || 'localhost',
      '-p', String(this.configService.get<number>('database.port') || 5432),
      '-U', this.configService.get<string>('database.user') || 'postgres',
      '-d', this.configService.get<string>('database.name') || 'postgres',
    ];
  }

  async dumpDatabase(): Promise<Readable> {
    const output = new PassThrough();
    const args = [...this.connectionArgs(), '-Fc', '--no-owner', '--no-privileges'];
    this.logger.log(`Starting bundled pg_dump (${this.pgDumpPath})`);

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.pgDumpPath, args, { env: this.connectionEnv() });
    } catch (err) {
      process.nextTick(() => output.destroy(new Error(`Bundled pg_dump failed to start: ${(err as Error).message}`)));
      return output;
    }

    let stderrBuf = Buffer.alloc(0);
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      output.destroy(new Error(`Bundled pg_dump not found at "${this.pgDumpPath}": ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        output.destroy(new Error(`Bundled pg_dump exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
      }
    });

    return output;
  }

  async restoreDatabase(source: Readable): Promise<void> {
    const args = [...this.connectionArgs(), '--clean', '--if-exists', '--no-owner', '--no-privileges'];
    this.logger.log(`Starting bundled pg_restore (${this.pgRestorePath})`);

    return new Promise<void>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.pgRestorePath, args, { env: this.connectionEnv() });
      } catch (err) {
        reject(new Error(`Bundled pg_restore failed to start: ${(err as Error).message}`));
        return;
      }

      let stderrBuf = Buffer.alloc(0);
      child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        reject(new Error(`Bundled pg_restore not found at "${this.pgRestorePath}": ${err.message}`));
      });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Bundled pg_restore exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
        } else {
          resolve();
        }
      });

      source.on('error', (err) => child.stdin.destroy(err as Error));
      source.pipe(child.stdin);
    });
  }

  async getDatabaseVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const args = [...this.connectionArgs(), '-tAc', 'SHOW server_version;'];
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.psqlPath, args, { env: this.connectionEnv() });
      } catch {
        resolve(null);
        return;
      }
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
      child.on('error', () => resolve(null));
      child.on('close', (code) => resolve(code === 0 ? out.trim() || null : null));
    });
  }

  async testConfiguration(): Promise<TestConfigurationResult> {
    const [dumpCheck, restoreCheck] = await Promise.all([
      this.runVersionCheck(this.pgDumpPath),
      this.runVersionCheck(this.pgRestorePath),
    ]);
    if (!dumpCheck.ok) {
      return { ok: false, message: `Bundled pg_dump not found or not runnable at "${this.pgDumpPath}": ${dumpCheck.error}` };
    }
    if (!restoreCheck.ok) {
      return { ok: false, message: `Bundled pg_restore not found or not runnable at "${this.pgRestorePath}": ${restoreCheck.error}` };
    }
    const compatible = !!dumpCheck.version && !!restoreCheck.version && dumpCheck.version === restoreCheck.version;
    return {
      ok: true,
      pgDumpVersion: dumpCheck.version ?? undefined,
      pgRestoreVersion: restoreCheck.version ?? undefined,
      compatible,
      message: compatible
        ? `Bundled pg_dump ${dumpCheck.version} and pg_restore ${restoreCheck.version} found and compatible.`
        : `Bundled pg_dump ${dumpCheck.version ?? 'unknown'} and pg_restore ${restoreCheck.version ?? 'unknown'} found, but versions do not match.`,
    };
  }

  /** Does NOT spawn -- version is only known after testConfiguration()/validate() actually runs `--version`; PgEngineService caches that result. */
  async describe(): Promise<EngineDescription> {
    return { mode: 'bundled', version: null, location: 'Bundled with ZoeConnect', detectedAutomatically: false };
  }

  private runVersionCheck(execPath: string): Promise<{ ok: boolean; version: string | null; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; version: string | null; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      let child: ChildProcessWithoutNullStreams;
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
        finish({ ok: false, version: null, error: err.code === 'ENOENT' ? 'no such file or not executable' : err.message });
      });
      child.on('close', (code) => {
        if (code !== 0) {
          finish({ ok: false, version: null, error: stderr.trim() || `exited with code ${code}` });
          return;
        }
        const match = stdout.match(/(\d+(?:\.\d+)+)/) || stdout.match(/\s(\d+)\s*(?:\(|$)/);
        finish({ ok: true, version: match ? match[1] : null });
      });
    });
  }
}
