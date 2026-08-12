import { PgEngineService } from '../services/pg-engine.service';
import { DockerPgExecutionStrategy } from '../services/pg-docker-execution.strategy';
import { BundledPgExecutionStrategy } from '../services/pg-bundled-execution.strategy';
import { UnavailablePgExecutionStrategy } from '../services/pg-unavailable-execution.strategy';

describe('PgEngineService.resolveStrategy() precedence', () => {
  function createService(opts: {
    row?: any;
    localOk?: boolean;
    dockerDetected?: string | null;
  }) {
    const row = opts.row ?? null;
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue(undefined),
    } as any;
    const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const pgToolsService = { detectInstallations: jest.fn().mockResolvedValue({}) } as any;
    const pgDumpService = {
      testConfiguration: jest.fn().mockResolvedValue({ ok: opts.localOk ?? false, message: opts.localOk ? 'ok' : 'not found' }),
    } as any;
    const dockerDetectionService = {
      detect: jest.fn().mockResolvedValue({ containerName: opts.dockerDetected ?? null, source: opts.dockerDetected ? 'running-container' : null }),
    } as any;

    const service = new PgEngineService(repo, configService, auditService, pgToolsService, pgDumpService, dockerDetectionService);
    return { service, repo, configService, pgDumpService, dockerDetectionService };
  }

  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  it('1. bundled dir env var wins over everything, even an explicit local/docker override', async () => {
    process.env.BACKUP_BUNDLED_PG_DIR = '/opt/zoeconnect/pg';
    const { service } = createService({ row: { executionMode: 'docker', dockerContainerName: 'pg17' }, localOk: true, dockerDetected: 'pg17' });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBeInstanceOf(BundledPgExecutionStrategy);
  });

  it("2a. explicit executionMode='local' override wins over auto-docker even when local isn't actually testable", async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service, pgDumpService } = createService({ row: { executionMode: 'local' }, localOk: false });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBe(pgDumpService);
  });

  it("2b. explicit executionMode='docker' override uses the ADMIN-set dockerContainerName directly, without calling detection", async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service, dockerDetectionService } = createService({ row: { executionMode: 'docker', dockerContainerName: 'my-pg' } });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBeInstanceOf(DockerPgExecutionStrategy);
    expect(dockerDetectionService.detect).not.toHaveBeenCalled();
  });

  it("2c. executionMode='docker' with no dockerContainerName set falls through to Unavailable with clear guidance", async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service } = createService({ row: { executionMode: 'docker', dockerContainerName: null } });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBeInstanceOf(UnavailablePgExecutionStrategy);
    const result = await strategy.testConfiguration();
    expect(result.message).toMatch(/Docker/);
  });

  it('3a. auto mode: a real, testable local pg_dump wins over Docker', async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service, pgDumpService, dockerDetectionService } = createService({ row: { executionMode: 'auto' }, localOk: true, dockerDetected: 'pg17' });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBe(pgDumpService);
    expect(dockerDetectionService.detect).not.toHaveBeenCalled();
  });

  it('3b. auto mode: local fails -> falls back to Docker detection and caches the found container name', async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service, repo } = createService({ row: { executionMode: 'auto' }, localOk: false, dockerDetected: 'auto-detected-pg' });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBeInstanceOf(DockerPgExecutionStrategy);
    expect(repo.update).toHaveBeenCalledWith('singleton', expect.objectContaining({ detectedDockerContainerName: 'auto-detected-pg' }));
  });

  it('3c. auto mode: neither local nor Docker resolves -> Unavailable', async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service } = createService({ row: { executionMode: 'auto' }, localOk: false, dockerDetected: null });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBeInstanceOf(UnavailablePgExecutionStrategy);
  });

  it('defaults to auto when no row exists yet', async () => {
    delete process.env.BACKUP_BUNDLED_PG_DIR;
    const { service, pgDumpService } = createService({ row: null, localOk: true });
    const strategy = await service.resolveStrategy();
    expect(strategy).toBe(pgDumpService);
  });
});

describe('PgEngineService.getEngineStatus()', () => {
  function createService(row: any) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn((partial: any) => ({ ...partial })),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue(undefined),
    } as any;
    const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const pgToolsService = { detectInstallations: jest.fn().mockResolvedValue({}) } as any;
    const pgDumpService = {
      testConfiguration: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
      describe: jest.fn().mockResolvedValue({ mode: 'local', version: '17.4', location: 'Detected Automatically', detectedAutomatically: true }),
    } as any;
    const dockerDetectionService = { detect: jest.fn().mockResolvedValue({ containerName: null, source: null }) } as any;
    return new PgEngineService(repo, configService, auditService, pgToolsService, pgDumpService, dockerDetectionService);
  }

  it('reports status "healthy" when resolved and last validation succeeded or was never run', async () => {
    const service = createService({ executionMode: 'auto', lastTestStatus: null, lastTestedAt: null, lastTestMessage: null, detectedVersion: null });
    const status = await service.getEngineStatus();
    expect(status.status).toBe('healthy');
    expect(status.mode).toBe('local');
  });

  it('reports status "degraded" when the last validation failed', async () => {
    const service = createService({ executionMode: 'auto', lastTestStatus: 'failure', lastTestedAt: new Date(), lastTestMessage: 'boom', detectedVersion: null });
    const status = await service.getEngineStatus();
    expect(status.status).toBe('degraded');
    expect(status.lastValidationOk).toBe(false);
  });
});
