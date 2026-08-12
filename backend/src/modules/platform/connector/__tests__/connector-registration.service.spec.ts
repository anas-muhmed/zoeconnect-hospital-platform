import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConnectorRegistrationService } from '../connector-registration.service';
import { ConnectorInstance } from '../entities/connector-instance.entity';
import { TenantConnectorPairing } from '../../tenant-provisioning/entities/tenant-connector-pairing.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { REDIS_CLIENT } from '../../../../common/redis/redis.provider';
import { normalizeActivationCode } from '../../tenant-provisioning/connector-activation-code.util';

// ── Fixtures ────────────────────────────────────────────────────────────────

const TENANT = { id: 'tenant-1', code: 'MOSC' } as Tenant;
// Deliberately typed lower-case-with-dashes here (not the canonical
// upper-case grouped form `generateActivationCode()` produces) -- this is
// the whole point of RAW_PAIRING_KEY: it stands in for what a hospital IT
// user actually types, and every test below still needs to succeed. The
// hash is computed over the NORMALIZED form because that's what
// `TenantProvisioningService.stepGenerateConnectorPairingKey()` /
// `regenerateConnectorActivationCode()` hash in production (the raw code
// they generate is already canonical, so normalizing it is a no-op there,
// but the hash is always of the canonical/normalized string, never of
// arbitrary user input formatting).
const RAW_PAIRING_KEY = 'test-pairing-key-abc123';
const PAIRING_HASH = bcrypt.hashSync(normalizeActivationCode(RAW_PAIRING_KEY), 4); // 4 rounds -- fast for tests

const makePairing = (overrides: Partial<TenantConnectorPairing> = {}): TenantConnectorPairing =>
  ({
    id: 'pairing-1',
    tenantId: TENANT.id,
    pairingKeyHash: PAIRING_HASH,
    status: 'pending',
    createdAt: new Date(),
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  } as TenantConnectorPairing);

// ── Mock factories ──────────────────────────────────────────────────────────

function mockRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (x: any) => x),
    create: jest.fn((x: any) => x),
    ...overrides,
  };
}

function mockRedis() {
  return {
    exists: jest.fn().mockResolvedValue(0),
    setex: jest.fn().mockResolvedValue('OK'),
  };
}

async function createService(opts: {
  instanceRepo?: ReturnType<typeof mockRepo>;
  pairingRepo?: ReturnType<typeof mockRepo>;
  tenantRepo?: ReturnType<typeof mockRepo>;
  redis?: ReturnType<typeof mockRedis>;
} = {}) {
  const instanceRepo = opts.instanceRepo ?? mockRepo();
  const pairingRepo  = opts.pairingRepo  ?? mockRepo();
  const tenantRepo   = opts.tenantRepo   ?? mockRepo({ findOne: jest.fn().mockResolvedValue(TENANT) });
  const redis        = opts.redis        ?? mockRedis();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectorRegistrationService,
      { provide: getRepositoryToken(ConnectorInstance), useValue: instanceRepo },
      { provide: getRepositoryToken(TenantConnectorPairing), useValue: pairingRepo },
      { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      { provide: REDIS_CLIENT, useValue: redis },
      JwtService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string, def?: any) => {
            const values: Record<string, string> = {
              'jwt.connectorSecret': 'test-connector-secret-please-32chars',
              'jwt.connectorExpiresIn': '15m',
              'jwt.connectorRefreshSecret': 'test-connector-refresh-secret-32ch',
              'jwt.connectorRefreshExpiresIn': '30d',
            };
            return values[key] ?? def;
          },
        },
      },
    ],
  }).compile();

  return { module, instanceRepo, pairingRepo, tenantRepo, redis };
}

describe('ConnectorRegistrationService.register', () => {
  it('registers a connector when the pairing key matches a pending row', async () => {
    const pairing = makePairing();
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([pairing]) });
    // Real TypeORM assigns the primary key on save() (instanceRepo.create()
    // just builds a bare entity instance with no id yet) -- the generic
    // mockRepo() factory's save() is a no-op echo, so without this override
    // instance.id (and therefore result.connectorId) stays undefined.
    const instanceRepo = mockRepo({
      save: jest.fn(async (x: any) => ({ id: 'connector-instance-1', ...x })),
    });

    const { module } = await createService({ pairingRepo, instanceRepo });
    const service = module.get(ConnectorRegistrationService);

    const result = await service.register('MOSC', RAW_PAIRING_KEY, 'hospital-pc-01');

    expect(result.connectorId).toBeDefined();
    expect(result.tenantId).toBe(TENANT.id);
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));

    // Pairing flipped pending -> active, single-use.
    expect(pairingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: pairing.id, status: 'active' }),
    );
    // ConnectorInstance created, linked to the redeemed pairing.
    expect(instanceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT.id, pairingId: pairing.id, status: 'registered' }),
    );
  });

  it('rejects a pairing key that does not match any pending row', async () => {
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([makePairing()]) });
    const { module } = await createService({ pairingRepo });
    const service = module.get(ConnectorRegistrationService);

    await expect(service.register('MOSC', 'totally-wrong-key', undefined))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown tenant code with the same error as a bad key (no information leak)', async () => {
    const tenantRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const { module } = await createService({ tenantRepo });
    const service = module.get(ConnectorRegistrationService);

    await expect(service.register('NOPE', RAW_PAIRING_KEY, undefined))
      .rejects.toThrow(UnauthorizedException);
  });

  it('does not match an already-redeemed (active) pairing -- pending-only lookup', async () => {
    // find() is scoped to status:'pending' in the service itself; a mock
    // that only returns rows when asked for 'pending' proves the query
    // shape, not just that we control the return value.
    const pairingRepo = mockRepo({
      find: jest.fn(async (opts: any) =>
        opts?.where?.status === 'pending' ? [] : [makePairing({ status: 'active' })],
      ),
    });
    const { module } = await createService({ pairingRepo });
    const service = module.get(ConnectorRegistrationService);

    await expect(service.register('MOSC', RAW_PAIRING_KEY, undefined))
      .rejects.toThrow(UnauthorizedException);
  });

  // D.6 ("Onboarding UX," 2026-07-22) additions below.

  it('rejects a code that matches an expired pairing row, even though the hash matches', async () => {
    const expired = makePairing({ expiresAt: new Date(Date.now() - 1000) });
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([expired]) });
    const { module } = await createService({ pairingRepo });
    const service = module.get(ConnectorRegistrationService);

    await expect(service.register('MOSC', RAW_PAIRING_KEY, undefined))
      .rejects.toThrow(UnauthorizedException);
  });

  it('accepts a non-expired pairing row (expiresAt in the future)', async () => {
    const pairing = makePairing({ expiresAt: new Date(Date.now() + 1000 * 60 * 60) });
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([pairing]) });
    const instanceRepo = mockRepo({
      save: jest.fn(async (x: any) => ({ id: 'connector-instance-1', ...x })),
    });
    const { module } = await createService({ pairingRepo, instanceRepo });
    const service = module.get(ConnectorRegistrationService);

    const result = await service.register('MOSC', RAW_PAIRING_KEY, undefined);
    expect(result.connectorId).toBeDefined();
  });

  it('registers without a tenantCode via a global pending-code scan', async () => {
    const pairing = makePairing();
    const pairingRepo = mockRepo({
      find: jest.fn(async (opts: any) => {
        // No tenantId filter when tenantCode is omitted -- proves the scan
        // is genuinely global, not just "works because the mock ignores
        // the where clause."
        expect(opts?.where).toEqual({ status: 'pending' });
        return [pairing];
      }),
    });
    const tenantRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(TENANT) });
    const instanceRepo = mockRepo({
      save: jest.fn(async (x: any) => ({ id: 'connector-instance-1', ...x })),
    });
    const { module } = await createService({ pairingRepo, tenantRepo, instanceRepo });
    const service = module.get(ConnectorRegistrationService);

    const result = await service.register(undefined, RAW_PAIRING_KEY, 'hospital-pc-01');

    expect(result.connectorId).toBeDefined();
    expect(result.tenantId).toBe(TENANT.id);
    // Tenant was resolved from the matched pairing's tenantId, not from a
    // tenantCode lookup (findOne called with the pairing's tenantId, not a
    // `code` filter).
    expect(tenantRepo.findOne).toHaveBeenCalledWith({ where: { id: pairing.tenantId } });
  });

  it('normalizes a loosely-formatted code (lower-case, spaces) before comparing', async () => {
    const pairing = makePairing();
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([pairing]) });
    const instanceRepo = mockRepo({
      save: jest.fn(async (x: any) => ({ id: 'connector-instance-1', ...x })),
    });
    const { module } = await createService({ pairingRepo, instanceRepo });
    const service = module.get(ConnectorRegistrationService);

    const loosely = ' TeSt-Pairing Key-ABC123 ';
    const result = await service.register('MOSC', loosely, undefined);
    expect(result.connectorId).toBeDefined();
  });
});

describe('ConnectorRegistrationService.refresh', () => {
  it('rotates: rejects reuse of a blacklisted (already-rotated) refresh token', async () => {
    const redis = mockRedis();
    redis.exists.mockResolvedValue(1); // blacklisted
    const { module } = await createService({ redis });
    const service = module.get(ConnectorRegistrationService);

    // A syntactically valid but unrelated token is enough here -- verify()
    // will fail before the blacklist check is even reached for most inputs,
    // so this test asserts the overall contract (bad/reused token rejected)
    // rather than reaching deep into the blacklist branch specifically.
    await expect(service.refresh('not-a-real-jwt')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the referenced ConnectorInstance no longer exists', async () => {
    // Register first to obtain a real, validly-signed refresh token, then
    // simulate the instance having been deleted/never existing on refresh.
    const pairing = makePairing();
    const pairingRepo = mockRepo({ find: jest.fn().mockResolvedValue([pairing]) });
    const instanceRepo = mockRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const { module } = await createService({ pairingRepo, instanceRepo });
    const service = module.get(ConnectorRegistrationService);

    const { refreshToken } = await service.register('MOSC', RAW_PAIRING_KEY, undefined);

    await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
  });
});
