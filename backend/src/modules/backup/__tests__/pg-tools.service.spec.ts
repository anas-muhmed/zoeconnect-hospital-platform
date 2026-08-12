import { PgToolsService, PG_TOOLS_NOT_CONFIGURED_MESSAGE } from '../services/pg-tools.service';
import { BackupToolSettings } from '../entities/backup-tool-settings.entity';

describe('PgToolsService', () => {
  function createService(row: Partial<BackupToolSettings> | null = null) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn((partial: any) => partial),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue(undefined),
    } as any;
    const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PgToolsService(repo, configService, auditService);
    return { service, repo, configService, auditService };
  }

  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('resolution order precedence', () => {
    it('4. falls back to the bare command when nothing else is configured', async () => {
      delete process.env.PG_DUMP_PATH;
      delete process.env.PG_RESTORE_PATH;
      const { service, configService } = createService(null);
      // backup.config.ts defaults -- resolveWithSource() only treats these
      // as a "legacy configured" fallback when they differ from the bare
      // command name, so returning the bare defaults here must still fall
      // through to step 4, exactly like backup.config.ts's real defaults do.
      configService.get.mockImplementation((key: string) =>
        key === 'backup.pgDumpPath' ? 'pg_dump' : key === 'backup.pgRestorePath' ? 'pg_restore' : undefined);
      await expect(service.resolvePgDumpPath()).resolves.toBe('pg_dump');
      await expect(service.resolvePgRestorePath()).resolves.toBe('pg_restore');
    });

    it('3. env var wins over the bare command', async () => {
      process.env.PG_DUMP_PATH = '/opt/legacy/pg_dump';
      process.env.PG_RESTORE_PATH = '/opt/legacy/pg_restore';
      const { service } = createService(null);
      await expect(service.resolvePgDumpPath()).resolves.toBe('/opt/legacy/pg_dump');
      await expect(service.resolvePgRestorePath()).resolves.toBe('/opt/legacy/pg_restore');
    });

    it('2. cached auto-detected path wins over the env var', async () => {
      process.env.PG_DUMP_PATH = '/opt/legacy/pg_dump';
      process.env.PG_RESTORE_PATH = '/opt/legacy/pg_restore';
      const { service } = createService({
        pgDumpPath: null,
        pgRestorePath: null,
        detectedPgDumpPath: '/usr/lib/postgresql/17/bin/pg_dump',
        detectedPgRestorePath: '/usr/lib/postgresql/17/bin/pg_restore',
      } as BackupToolSettings);
      await expect(service.resolvePgDumpPath()).resolves.toBe('/usr/lib/postgresql/17/bin/pg_dump');
      await expect(service.resolvePgRestorePath()).resolves.toBe('/usr/lib/postgresql/17/bin/pg_restore');
    });

    it('1. explicitly configured (saved) path wins over everything else', async () => {
      process.env.PG_DUMP_PATH = '/opt/legacy/pg_dump';
      process.env.PG_RESTORE_PATH = '/opt/legacy/pg_restore';
      const { service } = createService({
        pgDumpPath: '/admin/chosen/pg_dump',
        pgRestorePath: '/admin/chosen/pg_restore',
        detectedPgDumpPath: '/usr/lib/postgresql/17/bin/pg_dump',
        detectedPgRestorePath: '/usr/lib/postgresql/17/bin/pg_restore',
      } as BackupToolSettings);
      await expect(service.resolvePgDumpPath()).resolves.toBe('/admin/chosen/pg_dump');
      await expect(service.resolvePgRestorePath()).resolves.toBe('/admin/chosen/pg_restore');
    });
  });

  describe('testConfiguration()', () => {
    it('never throws and returns a clean { ok: false, message } result for a nonexistent path', async () => {
      const { service } = createService(null);
      const result = await service.testConfiguration(
        '/definitely/does/not/exist/pg_dump',
        '/definitely/does/not/exist/pg_restore',
      );
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not found|not runnable/i);
    });

    it('reports the first failing binary (pg_dump) distinctly from pg_restore', async () => {
      const { service } = createService(null);
      const result = await service.testConfiguration('/nope/pg_dump', '/nope/pg_restore');
      expect(result.message).toMatch(/pg_dump/);
    });
  });

  describe('version-string parsing', () => {
    it('parses "pg_dump (PostgreSQL) 17.4" -> "17.4"', () => {
      const { service } = createService(null);
      expect((service as any).parseVersionString('pg_dump (PostgreSQL) 17.4')).toBe('17.4');
    });

    it('parses "pg_restore (PostgreSQL) 16.2 (Ubuntu 16.2-1)" -> "16.2"', () => {
      const { service } = createService(null);
      expect((service as any).parseVersionString('pg_restore (PostgreSQL) 16.2 (Ubuntu 16.2-1)')).toBe('16.2');
    });

    it('returns null for unparsable output', () => {
      const { service } = createService(null);
      expect((service as any).parseVersionString('not a version string')).toBeNull();
    });
  });

  describe('saveSettings()', () => {
    it('persists lastTestedAt/lastTestStatus/lastTestMessage after running a test as part of the save flow', async () => {
      const { service, repo } = createService(null);
      await service.saveSettings('/nope/pg_dump', '/nope/pg_restore', 'user-123');
      expect(repo.update).toHaveBeenCalledWith(
        'singleton',
        expect.objectContaining({
          pgDumpPath: '/nope/pg_dump',
          pgRestorePath: '/nope/pg_restore',
          lastTestStatus: 'failure',
          updatedBy: 'user-123',
        }),
      );
    });
  });

  describe('PG_TOOLS_NOT_CONFIGURED_MESSAGE', () => {
    it('is a clear, user-facing string mentioning where to configure the tools', () => {
      expect(PG_TOOLS_NOT_CONFIGURED_MESSAGE).toMatch(/pg_dump/);
      expect(PG_TOOLS_NOT_CONFIGURED_MESSAGE).toMatch(/pg_restore/);
      expect(PG_TOOLS_NOT_CONFIGURED_MESSAGE).toMatch(/Settings/);
    });
  });
});
