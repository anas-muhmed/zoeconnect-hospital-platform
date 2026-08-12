import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ReferenceService } from '../reference.service';
import { HisConfigService } from '../../config/his-config.service';
import { REDIS_CLIENT } from '../../../../common/redis/redis.provider';
// Fix: ReferenceService now injects the transport-agnostic ORACLE_TRANSPORT
// token (IOracleTransport), not the concrete OraclePoolService directly —
// this test previously registered the wrong DI token so Nest fell back to
// an unmocked real OraclePoolService (or failed to resolve it).
import { ORACLE_TRANSPORT } from '../../../platform/infrastructure/tokens';

function mockOracle(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    isAvailable: true,
    query:       jest.fn().mockResolvedValue([]),
    queryOne:    jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function mockHisConfig(cfg: Record<string, string> = {}) {
  return { getConfig: jest.fn().mockResolvedValue(cfg) };
}

function mockRedis() {
  return {
    get:  jest.fn().mockResolvedValue(null),
    set:  jest.fn().mockResolvedValue('OK'),
    del:  jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  };
}

async function createService(opts: {
  oracle?: ReturnType<typeof mockOracle>;
  cfg?: Record<string, string>;
} = {}) {
  const oracle    = opts.oracle ?? mockOracle();
  const hisConfig = mockHisConfig(opts.cfg);
  const redis     = mockRedis();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ReferenceService,
      { provide: ORACLE_TRANSPORT, useValue: oracle },
      { provide: HisConfigService,  useValue: hisConfig },
      { provide: REDIS_CLIENT,      useValue: redis },
    ],
  }).compile();

  return { service: module.get(ReferenceService), oracle, hisConfig };
}

describe('ReferenceService.getUserContext', () => {
  it('returns null when Oracle finds no matching active HISUSER row', async () => {
    const { service, oracle } = await createService();
    const result = await service.getUserContext('nobody');
    expect(result).toBeNull();
    expect(oracle.queryOne).toHaveBeenCalledTimes(1);
  });

  it('returns { username, employeeCode } when a row is found, coercing employeeCode to a string', async () => {
    const oracle = mockOracle({
      queryOne: jest.fn().mockResolvedValue({ username: 'admin', employeeCode: 1042 }),
    });
    const { service } = await createService({ oracle });

    const result = await service.getUserContext('admin');
    expect(result).toEqual({ username: 'admin', employeeCode: '1042' });
  });

  it('throws ServiceUnavailableException before querying when Oracle is unavailable', async () => {
    const oracle = mockOracle({ isAvailable: false } as any);
    const { service } = await createService({ oracle });

    await expect(service.getUserContext('admin')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(oracle.queryOne).not.toHaveBeenCalled();
  });

  it('never queries more than one row worth of HISUSER (no full-table scan)', async () => {
    const { service, oracle } = await createService();
    await service.getUserContext('admin');

    const [sql] = oracle.queryOne.mock.calls[0];
    expect(sql).toMatch(/FROM HISUSER/i);
    expect(sql).toMatch(/WHERE\s+USERNAME\s*=\s*:username/i);
    expect(sql).toMatch(/ISACTIVE\s*=\s*1/i);
  });

  it('uses the sql.reference.userContext override from HIS config when present, instead of the built-in query', async () => {
    const customSql = 'SELECT LOGIN_NAME AS "username", EMP_CODE AS "employeeCode" FROM CUSTOM_USERS WHERE LOGIN_NAME = :username';
    const oracle = mockOracle({
      queryOne: jest.fn().mockResolvedValue({ username: 'admin', employeeCode: 'E9' }),
    });
    const { service, hisConfig } = await createService({
      oracle,
      cfg: { 'sql.reference.userContext': customSql },
    });

    await service.getUserContext('admin');
    expect(hisConfig.getConfig).toHaveBeenCalled();
    const [sql] = oracle.queryOne.mock.calls[0];
    expect(sql.trim()).toBe(customSql);
  });
});
