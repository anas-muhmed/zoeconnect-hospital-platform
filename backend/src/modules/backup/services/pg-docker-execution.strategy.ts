import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Readable, PassThrough } from 'stream';
import { IPgExecutionStrategy, TestConfigurationResult, EngineDescription } from './pg-execution-strategy.interface';

/**
 * DockerPgExecutionStrategy — runs `pg_dump`/`pg_restore`/`psql` INSIDE a
 * running Postgres container via `docker exec`, for deployments where
 * Postgres itself runs in Docker but the app (this Node process) runs on
 * the host and has no local `pg_dump`/`pg_restore` binaries installed.
 *
 * Two details that are easy to get wrong and are deliberately handled here:
 *
 *   1. `PGPASSWORD` must be visible to the process INSIDE the container,
 *      not the host running `docker exec`. `docker exec` does NOT forward
 *      the host's environment into the container by default, so setting it
 *      on the spawned Node child's `env` would do nothing. Instead it's
 *      passed via `docker exec -e PGPASSWORD=<pw> <container> ...` -- an
 *      explicit `-e` flag arg forwarded into the container's exec session.
 *
 *   2. Connection host/port target `localhost`/the container's *internal*
 *      Postgres port (5432 by default -- not whatever host port it's
 *      mapped to), because pg_dump/pg_restore/psql run *inside* the
 *      container's own network namespace via `docker exec`, so they reach
 *      Postgres the same way any other process inside that container would
 *      (loopback), regardless of how the container's ports are published
 *      to the host. `-U`/`-d` (username/database name) are unaffected by
 *      host-vs-container networking and reuse the same `database.*` config
 *      as LocalPgExecutionStrategy.
 *
 * Never throws from any public method -- spawn/docker errors are caught and
 * surfaced as a rejected Promise with a clear message (dumpDatabase/
 * restoreDatabase/getDatabaseVersion) or a { ok: false, message } result
 * (testConfiguration), same contract as PgDumpService/LocalPgExecutionStrategy.
 */
export class DockerPgExecutionStrategy implements IPgExecutionStrategy {
  private readonly logger = new Logger(DockerPgExecutionStrategy.name);

  constructor(
    private readonly containerName: string,
    private readonly configService: ConfigService,
    /** true when this container was found by PgDockerDetectionService (auto), false when the admin typed it in under Advanced. */
    private readonly detectedAutomatically: boolean,
    /** Last known version (from a prior testConfiguration()/validate() run), used by describe() so the health card doesn't have to spawn a process just to render. */
    private readonly cachedVersion: string | null = null,
  ) {}

  /** Internal (in-container) connection args -- always localhost:5432 unless database.port is explicitly non-default, since we're inside the container's own network namespace. */
  private connectionArgs(): string[] {
    return [
      '-h', 'localhost',
      '-p', '5432',
      '-U', this.configService.get<string>('database.user') || 'postgres',
      '-d', this.configService.get<string>('database.name') || 'postgres',
    ];
  }

  private password(): string {
    return this.configService.get<string>('database.password') || '';
  }

  private dockerExecArgs(interactive: boolean, tool: string, toolArgs: string[]): string[] {
    const base = ['exec', ...(interactive ? ['-i'] : []), '-e', `PGPASSWORD=${this.password()}`, this.containerName, tool];
    return [...base, ...toolArgs];
  }

  async dumpDatabase(): Promise<Readable> {
    const output = new PassThrough();
    const toolArgs = [...this.connectionArgs(), '-Fc', '--no-owner', '--no-privileges'];
    const args = this.dockerExecArgs(false, 'pg_dump', toolArgs);
    this.logger.log(`Starting docker exec pg_dump in container "${this.containerName}"`);

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn('docker', args);
    } catch (err) {
      process.nextTick(() => output.destroy(new Error(`Failed to start Docker: ${(err as Error).message}`)));
      return output;
    }

    let stderrBuf = Buffer.alloc(0);
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      output.destroy(this.friendlyDockerError(err));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        output.destroy(new Error(`pg_dump (in Docker container "${this.containerName}") exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
      }
    });

    return output;
  }

  async restoreDatabase(source: Readable): Promise<void> {
    const toolArgs = [...this.connectionArgs(), '--clean', '--if-exists', '--no-owner', '--no-privileges'];
    const args = this.dockerExecArgs(true, 'pg_restore', toolArgs);
    this.logger.log(`Starting docker exec -i pg_restore in container "${this.containerName}"`);

    return new Promise<void>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn('docker', args);
      } catch (err) {
        reject(new Error(`Failed to start Docker: ${(err as Error).message}`));
        return;
      }

      let stderrBuf = Buffer.alloc(0);
      child.stderr.on('data', (chunk: Buffer) => { stderrBuf = Buffer.concat([stderrBuf, chunk]); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        reject(this.friendlyDockerError(err));
      });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`pg_restore (in Docker container "${this.containerName}") exited with code ${code}: ${stderrBuf.toString('utf-8').slice(0, 4000)}`));
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
      const toolArgs = [...this.connectionArgs(), '-tAc', 'SHOW server_version;'];
      const args = this.dockerExecArgs(false, 'psql', toolArgs);
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn('docker', args);
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
      this.runVersionCheck('pg_dump'),
      this.runVersionCheck('pg_restore'),
    ]);

    if (!dumpCheck.ok) {
      return { ok: false, message: `pg_dump is not runnable inside Docker container "${this.containerName}": ${dumpCheck.error}` };
    }
    if (!restoreCheck.ok) {
      return { ok: false, message: `pg_restore is not runnable inside Docker container "${this.containerName}": ${restoreCheck.error}` };
    }

    const compatible = !!dumpCheck.version && !!restoreCheck.version && dumpCheck.version === restoreCheck.version;
    const message = compatible
      ? `pg_dump ${dumpCheck.version} and pg_restore ${restoreCheck.version} found and compatible inside Docker container "${this.containerName}".`
      : `pg_dump ${dumpCheck.version ?? 'unknown'} and pg_restore ${restoreCheck.version ?? 'unknown'} found in container "${this.containerName}", but versions do not match.`;

    return { ok: true, pgDumpVersion: dumpCheck.version ?? undefined, pgRestoreVersion: restoreCheck.version ?? undefined, compatible, message };
  }

  /** Does NOT spawn -- returns the last cached version (from a prior testConfiguration()/validate() run) passed in at construction. */
  async describe(): Promise<EngineDescription> {
    return {
      mode: 'docker',
      version: this.cachedVersion,
      location: `Docker container: ${this.containerName}`,
      detectedAutomatically: this.detectedAutomatically,
    };
  }

  private runVersionCheck(tool: 'pg_dump' | 'pg_restore'): Promise<{ ok: boolean; version: string | null; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; version: string | null; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn('docker', this.dockerExecArgs(false, tool, ['--version']));
      } catch (err) {
        finish({ ok: false, version: null, error: (err as Error).message });
        return;
      }

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        finish({ ok: false, version: null, error: this.friendlyDockerError(err).message });
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

  private friendlyDockerError(err: NodeJS.ErrnoException): Error {
    if (err.code === 'ENOENT') {
      return new Error(`Docker CLI ("docker") was not found on this server -- Docker execution mode requires the "docker" command to be available in PATH.`);
    }
    return err;
  }
}
