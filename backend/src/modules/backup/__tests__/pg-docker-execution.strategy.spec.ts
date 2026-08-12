import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import { PassThrough } from 'stream';
import { DockerPgExecutionStrategy } from '../services/pg-docker-execution.strategy';

/** Minimal fake ChildProcess -- enough for spawn() call-arg assertions plus a controllable stdout/stderr/exit. */
function fakeChild() {
  const child: any = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  return child;
}

describe('DockerPgExecutionStrategy — command construction', () => {
  let spawnSpy: jest.SpyInstance;
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'database.user': 'hdsp_app',
        'database.name': 'hdsp_db',
        'database.password': 's3cret',
      };
      return values[key];
    }),
  } as any;

  afterEach(() => {
    spawnSpy.mockRestore();
  });

  it('dumpDatabase(): spawns `docker exec -e PGPASSWORD=<pw> <container> pg_dump` targeting localhost:5432 (in-container network), not the host-mapped port', async () => {
    const child = fakeChild();
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);

    const strategy = new DockerPgExecutionStrategy('pg-container', configService, true);
    await strategy.dumpDatabase();

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnSpy.mock.calls[0];
    expect(cmd).toBe('docker');
    expect(args).toEqual([
      'exec',
      '-e', 'PGPASSWORD=s3cret',
      'pg-container',
      'pg_dump',
      '-h', 'localhost',
      '-p', '5432',
      '-U', 'hdsp_app',
      '-d', 'hdsp_db',
      '-Fc', '--no-owner', '--no-privileges',
    ]);
    // No -i flag for the non-interactive dump direction.
    expect(args).not.toContain('-i');
  });

  it('restoreDatabase(): spawns `docker exec -i -e PGPASSWORD=<pw> <container> pg_restore` (interactive, for stdin piping) and pipes the source stream into the child stdin', async () => {
    const child = fakeChild();
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);

    const strategy = new DockerPgExecutionStrategy('pg-container', configService, false);
    const source = new PassThrough();
    const restorePromise = strategy.restoreDatabase(source);

    const [cmd, args] = spawnSpy.mock.calls[0];
    expect(cmd).toBe('docker');
    expect(args[0]).toBe('exec');
    expect(args).toContain('-i');
    expect(args).toEqual(expect.arrayContaining(['-e', 'PGPASSWORD=s3cret', 'pg-container', 'pg_restore', '--clean', '--if-exists', '--no-owner', '--no-privileges']));

    source.end();
    child.emit('close', 0);
    await expect(restorePromise).resolves.toBeUndefined();
  });

  it('getDatabaseVersion(): spawns `docker exec <container> psql ... -tAc "SHOW server_version;"`', async () => {
    const child = fakeChild();
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);

    const strategy = new DockerPgExecutionStrategy('pg-container', configService, true);
    const versionPromise = strategy.getDatabaseVersion();
    child.stdout.emit('data', Buffer.from('16.2\n'));
    child.emit('close', 0);

    await expect(versionPromise).resolves.toBe('16.2');
    const [cmd, args] = spawnSpy.mock.calls[0];
    expect(cmd).toBe('docker');
    expect(args).toEqual(expect.arrayContaining(['psql', '-tAc', 'SHOW server_version;']));
  });

  it('never throws when the docker CLI itself is missing (ENOENT) -- dumpDatabase() surfaces via the stream error event with a friendly message', async () => {
    const child = fakeChild();
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);

    const strategy = new DockerPgExecutionStrategy('pg-container', configService, true);
    const output = await strategy.dumpDatabase();

    const errorPromise = new Promise<Error>((resolve) => output.on('error', resolve));
    const err: any = new Error('spawn docker ENOENT');
    err.code = 'ENOENT';
    child.emit('error', err);

    const caught = await errorPromise;
    expect(caught.message).toMatch(/Docker CLI/);
  });

  it('describe(): does not spawn a process -- reflects the cached version and detectedAutomatically flag passed at construction', async () => {
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue(fakeChild());
    const strategy = new DockerPgExecutionStrategy('pg-container', configService, true, '16.2');
    const description = await strategy.describe();
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(description).toEqual({ mode: 'docker', version: '16.2', location: 'Docker container: pg-container', detectedAutomatically: true });
  });
});
