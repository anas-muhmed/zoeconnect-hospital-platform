import { BackupHealthCheckService } from '../services/backup-health-check.service';

describe('BackupHealthCheckService.runFullHealthCheck()', () => {
  function createService(overrides: {
    redetect?: () => Promise<any>;
    dbQuery?: () => Promise<any>;
    testConfig?: () => Promise<any>;
    findAll?: () => Promise<any>;
    getCapacity?: () => Promise<any>;
    testConnection?: () => Promise<any>;
    schedulerHealth?: () => Promise<any>;
    encryptionEnabled?: boolean;
    resolvePassphrase?: () => string;
  } = {}) {
    const dataSource = {
      query: overrides.dbQuery ?? jest.fn().mockResolvedValue([{}]),
    } as any;
    const configService = {
      get: jest.fn((key: string) => (key === 'backup.encryptionEnabledByDefault' ? overrides.encryptionEnabled ?? false : undefined)),
    } as any;
    const pgEngineService = {
      redetect: overrides.redetect ?? jest.fn().mockResolvedValue({ status: 'healthy', strategyLabel: 'Local PostgreSQL Client', version: '17.4', lastValidationMessage: null }),
      testConfiguration: overrides.testConfig ?? jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    } as any;
    const storageConfigService = {
      findAll: overrides.findAll ?? jest.fn().mockResolvedValue([]),
      getCapacity: overrides.getCapacity ?? jest.fn().mockResolvedValue({ availableBytes: 10 * 1024 * 1024 * 1024, totalBytes: null, usedByBackupsBytes: null, healthy: true }),
      testConnection: overrides.testConnection ?? jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    } as any;
    const storageProviderFactory = {
      forDefaultLocal: () => ({
        getCapacity: overrides.getCapacity ?? jest.fn().mockResolvedValue({ availableBytes: 10 * 1024 * 1024 * 1024, totalBytes: null, usedByBackupsBytes: null, healthy: true }),
        testConnection: overrides.testConnection ?? jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
      }),
    } as any;
    const schedulerService = {
      getSchedulerHealth: overrides.schedulerHealth ?? jest.fn().mockResolvedValue({ running: true, activeSchedules: 0, registeredCronJobs: 0, message: 'no schedules' }),
    } as any;
    const encryptionService = {
      resolvePassphrase: overrides.resolvePassphrase ?? jest.fn().mockReturnValue('secret'),
    } as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;

    return new BackupHealthCheckService(
      dataSource, configService, pgEngineService, storageConfigService,
      storageProviderFactory, schedulerService, encryptionService, auditService,
    );
  }

  it('runs all 8 checks and reports overall pass when everything succeeds', async () => {
    const service = createService();
    const report = await service.runFullHealthCheck('actor-1');
    expect(report.items).toHaveLength(8);
    expect(report.overallStatus).toBe('pass');
    expect(report.items.every((i) => i.status === 'pass')).toBe(true);
  });

  it('runs EVERY check even when one of them throws -- does not short-circuit', async () => {
    const service = createService({
      redetect: jest.fn().mockRejectedValue(new Error('detection blew up')),
    });
    const report = await service.runFullHealthCheck();
    // All 8 items must still be present, not just the ones before the failure.
    expect(report.items).toHaveLength(8);
    const detectItem = report.items.find((i) => i.key === 'detect_provider');
    expect(detectItem?.status).toBe('fail');
    expect(detectItem?.message).toMatch(/detection blew up/);
    // Every other check still ran and passed.
    const others = report.items.filter((i) => i.key !== 'detect_provider');
    expect(others.every((i) => i.status === 'pass')).toBe(true);
  });

  it('overall status is fail if ANY item fails, even if most pass', async () => {
    const service = createService({
      testConnection: jest.fn().mockResolvedValue({ ok: false, message: 'storage unreachable' }),
    });
    const report = await service.runFullHealthCheck();
    expect(report.overallStatus).toBe('fail');
  });

  it('overall status is warn (not fail) when only warnings are present', async () => {
    const service = createService({
      schedulerHealth: jest.fn().mockResolvedValue({ running: false, activeSchedules: 2, registeredCronJobs: 1, message: 'mismatch' }),
    });
    const report = await service.runFullHealthCheck();
    expect(report.items.find((i) => i.key === 'scheduler')?.status).toBe('warn');
    expect(report.overallStatus).toBe('warn');
  });
});
