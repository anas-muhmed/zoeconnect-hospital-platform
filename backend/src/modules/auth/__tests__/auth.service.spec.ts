import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../rbac/entities/role.entity';
import { Tenant } from '../../platform/tenant/entities/tenant.entity';
import { AuditService } from '../../audit/audit.service';
import { BranchService } from '../../branch/branch.service';
import { PasswordResetService } from '../password-reset.service';
import { SettingsService } from '../../settings/settings.service';
import { ReferenceService } from '../../his/reference/reference.service';
import { HisTokenBridgeService } from '../../his/token/his-token-bridge.service';
import { UsersService } from '../../users/users.service';
import { TenantContextService } from '../../platform/tenant/tenant-context.service';
import { VendorSyncService } from '../../licensing/vendor-sync.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RAW_PASSWORD = 'correct-password';
const PASSWORD_HASH = bcrypt.hashSync(RAW_PASSWORD, 4); // 4 rounds — fast for tests

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'testuser',
    email: 'testuser@example.com',
    fullName: 'Test User',
    passwordHash: PASSWORD_HASH,
    isActive: true,
    isLocked: false,
    lockedUntil: null,
    failedLoginCount: 0,
    // Tenant-Scoped User Identity, Task 5: User.tenantId is now NOT NULL at
    // the DB level -- fixture default matches, individual tests override
    // as needed (e.g. 'tenant-a'/'tenant-b' for the shadow-mode tests).
    tenantId: 'default-tenant-id',
    hisEmployeeCode: null,
    directPermissions: [],
    permissionKeys: [],
    mustChangePassword: false,
    lastLoginAt: null,
    roles: [{ id: 'role-1', name: 'STAFF', permissions: [] }] as any,
    ...overrides,
  } as User);

// ── Mock factories ────────────────────────────────────────────────────────────

/**
 * `findOneImpl` receives the raw `{ where, relations, ... }` options object
 * passed by AuthService and decides what to return -- lets each test express
 * "legacy (username-only) query returns X, tenant-scoped query returns Y"
 * without needing to know call ordering.
 */
type FindOneImpl = (opts: any) => Promise<User | null> | User | null;

// ZoeConnect Identity Architecture Migration, Phase 3 -- resolveLoginUserGlobal()
// uses createQueryBuilder().leftJoinAndSelect(...).where(...).getOne(), so the
// query-builder stub needs those chainable methods too (existing stub only had
// innerJoin/where/andWhere/getCount, for the pre-existing setup-required check).
type QueryBuilderGetOneImpl = () => Promise<User | null> | User | null;
// Production incident, 2026-08 -- resolveLoginUserGlobal() now runs a
// getCount() duplicate-check before its getOne() lookup (see that method's
// own doc comment). Default 1 keeps every pre-existing test's "exactly one
// match" happy path unchanged; tests exercising the duplicate-detection
// safety net override this explicitly.
type QueryBuilderGetCountImpl = () => Promise<number> | number;

function mockUserRepo(
  findOneImpl?: FindOneImpl,
  queryBuilderGetOneImpl?: QueryBuilderGetOneImpl,
  queryBuilderGetCountImpl?: QueryBuilderGetCountImpl,
) {
  const impl = findOneImpl ?? (() => null);
  const qbGetOne = queryBuilderGetOneImpl ?? (() => null);
  const qbGetCount = queryBuilderGetCountImpl ?? (() => 1);
  return {
    findOne: jest.fn(async (opts: any) => impl(opts)),
    findOneOrFail: jest.fn(async (opts: any) => {
      const result = await impl(opts);
      if (!result) throw new Error('Row not found');
      return result;
    }),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: x.id ?? 'new-user-id', ...x })),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => qbGetCount()), // default: setup NOT required / exactly one identity match
      getOne: jest.fn(async () => qbGetOne()),
      // ZoeConnect Identity Architecture Migration, Phase 4.1 --
      // assertGlobalIdentityAvailable() (setupSuperAdmin()'s duplicate
      // check) uses createQueryBuilder().where(...).getExists(). Default
      // false ("no conflict") so every existing setupSuperAdmin test keeps
      // its current happy-path behavior unless a test explicitly overrides
      // this via mockReturnValueOnce/queryBuilderGetOneImpl-style wiring.
      getExists: jest.fn().mockResolvedValue(false),
    })),
  };
}

function mockRoleRepo(role?: Partial<Role> | null) {
  return { findOne: jest.fn().mockResolvedValue(role ?? { id: 'role-1', name: 'SUPER_ADMIN' }) };
}

function mockTenantRepo(tenant?: { id: string; name: string; code: string } | null) {
  return { findOne: jest.fn().mockResolvedValue(tenant ?? null) };
}

function mockVendorSyncService() {
  return { autoRegisterCloudTenant: jest.fn().mockResolvedValue({ id: 'reg-1' }) };
}

function mockAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function mockRedis() {
  return {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
  };
}

function mockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-token'),
    signAsync: jest.fn().mockImplementation((payload: any) => Promise.resolve(`mock-token.${payload.sub}`)),
    verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-1' }),
    decode: jest.fn().mockImplementation((token: string) => ({ sub: 'user-1', jti: 'jti-1', username: 'testuser' })),
  };
}

function mockConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'jwt.secret': 'test-secret',
    'jwt.expiresIn': '15m',
    'jwt.refreshSecret': 'test-refresh-secret',
    'jwt.refreshExpiresIn': '7d',
    LOGIN_TENANT_SCOPE_MODE: 'shadow',
    TENANT_SCOPE_GUARD_MODE: 'log-only',
    ...overrides,
  };
  return { get: jest.fn((key: string, def?: unknown) => values[key] ?? def) };
}

function mockBranchSvc(branches: { id: string; name: string }[] = []) {
  return {
    findAll: jest.fn().mockResolvedValue(branches),
    getUserBranches: jest.fn().mockResolvedValue(branches),
    validateUserBranch: jest.fn().mockResolvedValue(true),
    assignBranches: jest.fn().mockResolvedValue(undefined),
  };
}

function mockPasswordResetSvc() {
  return { markCompleted: jest.fn().mockResolvedValue(undefined) };
}

function mockSettingsService() {
  return { getSettings: jest.fn().mockResolvedValue({}) }; // idleTimeoutMinutes unset -> disabled
}

function mockReferenceSvc(userContext?: any) {
  return {
    getUserContext: jest.fn().mockResolvedValue(
      userContext ?? { employeeCode: 'EMP-001' },
    ),
  };
}

function mockUsersSvc(hisMappedUser?: User | null) {
  return { findByHisEmployeeCode: jest.fn().mockResolvedValue(hisMappedUser ?? null) };
}

function mockTenantContext() {
  return { getCurrentTenantId: jest.fn().mockResolvedValue('default-tenant-id') };
}

// ── Helper to build the module ────────────────────────────────────────────────

interface HarnessOptions {
  findOneImpl?: FindOneImpl;
  configOverrides?: Record<string, unknown>;
  branchList?: { id: string; name: string }[];
  hisUserContext?: any;
  hisMappedUser?: User | null;
  tenantRow?: { id: string; name: string; code: string } | null;
  /** ZoeConnect Identity Architecture Migration, Phase 3 -- backs resolveLoginUserGlobal()'s createQueryBuilder().getOne(). */
  queryBuilderGetOneImpl?: QueryBuilderGetOneImpl;
  /** Production incident, 2026-08 -- backs resolveLoginUserGlobal()'s duplicate-identity createQueryBuilder().getCount() check. */
  queryBuilderGetCountImpl?: QueryBuilderGetCountImpl;
}

async function createAuthService(opts: HarnessOptions = {}) {
  const userRepo = mockUserRepo(opts.findOneImpl, opts.queryBuilderGetOneImpl, opts.queryBuilderGetCountImpl);
  const roleRepo = mockRoleRepo();
  const tenantRepo = mockTenantRepo(opts.tenantRow);
  const vendorSyncService = mockVendorSyncService();
  const jwtSvc = mockJwtService();
  const config = mockConfig(opts.configOverrides);
  const audit = mockAuditService();
  const branchSvc = mockBranchSvc(opts.branchList);
  const passwordResetSvc = mockPasswordResetSvc();
  const settingsService = mockSettingsService();
  const referenceSvc = mockReferenceSvc(opts.hisUserContext);
  const usersSvc = mockUsersSvc(opts.hisMappedUser);
  const tenantContext = mockTenantContext();
  const redis = mockRedis();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: getRepositoryToken(User), useValue: userRepo },
      { provide: getRepositoryToken(Role), useValue: roleRepo },
      { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      { provide: getDataSourceToken(), useValue: {} },
      { provide: JwtService, useValue: jwtSvc },
      { provide: ConfigService, useValue: config },
      { provide: AuditService, useValue: audit },
      { provide: BranchService, useValue: branchSvc },
      { provide: PasswordResetService, useValue: passwordResetSvc },
      { provide: SettingsService, useValue: settingsService },
      { provide: ReferenceService, useValue: referenceSvc },
      { provide: HisTokenBridgeService, useValue: {} },
      { provide: UsersService, useValue: usersSvc },
      { provide: TenantContextService, useValue: tenantContext },
      { provide: 'REDIS_CLIENT', useValue: redis },
      { provide: VendorSyncService, useValue: vendorSyncService },
    ],
  }).compile();

  return {
    service: module.get<AuthService>(AuthService),
    userRepo, roleRepo, tenantRepo, jwtSvc, config, audit,
    branchSvc, passwordResetSvc, settingsService, referenceSvc,
    usersSvc, tenantContext, redis, vendorSyncService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('login (default shadow mode, no requestTenantId — pre-Task-3-equivalent behavior)', () => {
    it('returns tokens on valid credentials', async () => {
      const user = makeUser();
      const { service } = await createAuthService({ findOneImpl: () => user });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD },
        '127.0.0.1', 'Jest/1.0',
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
    });

    it('throws UnauthorizedException for unknown username', async () => {
      const { service } = await createAuthService({ findOneImpl: () => null });

      await expect(
        service.login({ username: 'ghost', password: 'any' }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const user = makeUser();
      const { service } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: 'wrong-password' }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('increments failedLoginCount on wrong password', async () => {
      const user = makeUser({ failedLoginCount: 0 });
      const { service, userRepo } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(userRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ failedLoginCount: 1 }),
      );
    });

    it('locks account after 5 failed attempts', async () => {
      const user = makeUser({ failedLoginCount: 4 });
      const { service, userRepo } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // handleFailedLogin() no longer sets a separate `isLocked` flag on the
      // update payload -- lock state is represented purely by `lockedUntil`
      // being set (User entity derives `isLocked` from it), so the update
      // call itself only ever carries `failedLoginCount`/`lockedUntil`.
      expect(userRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ failedLoginCount: 5, lockedUntil: expect.any(Date) }),
      );
    });

    it('rejects login for inactive user', async () => {
      const user = makeUser({ isActive: false });
      const { service } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects login for locked user', async () => {
      const user = makeUser({ isLocked: true, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) });
      const { service } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('resets failedLoginCount on successful login', async () => {
      const user = makeUser({ failedLoginCount: 3 });
      const { service, userRepo } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(userRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
      );
    });

    it('logs LOGIN_SUCCESS on valid credentials', async () => {
      const user = makeUser();
      const { service, audit } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_SUCCESS' }));
    });

    it('logs LOGIN_FAILED on wrong password', async () => {
      const user = makeUser();
      const { service, audit } = await createAuthService({ findOneImpl: () => user });

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }, '127.0.0.1', 'Jest'),
      ).rejects.toBeDefined();

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED' }));
    });

    it('does not run a tenant-aware query when requestTenantId is omitted', async () => {
      const user = makeUser();
      const { service, userRepo } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      // Only the legacy (username-only) lookup should have run.
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(userRepo.findOne.mock.calls[0][0].where).toEqual({ username: 'testuser' });
    });
  });

  describe('login — LOGIN_TENANT_SCOPE_MODE=legacy', () => {
    it('ignores requestTenantId entirely and runs a single global lookup', async () => {
      const user = makeUser();
      const { service, userRepo } = await createAuthService({
        findOneImpl: (opts) => (!opts.where.tenantId ? user : null),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'legacy' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'some-tenant-id',
      );

      expect(result).toHaveProperty('accessToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(userRepo.findOne.mock.calls[0][0].where).toEqual({ username: 'testuser' });
      // legacy mode never compares -- no mismatch log possible.
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('login_tenant_scope_mismatch'));
    });
  });

  describe('login — LOGIN_TENANT_SCOPE_MODE=shadow (default)', () => {
    it('authenticates using the legacy result even when a tenant-aware result agrees', async () => {
      const user = makeUser({ tenantId: 'tenant-a' });
      const { service, userRepo } = await createAuthService({
        findOneImpl: () => user, // same user for both legacy and tenant-aware queries
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'shadow' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'tenant-a',
      );

      expect(result).toHaveProperty('accessToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(2); // legacy + tenant-aware
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('login_tenant_scope_mismatch'));
    });

    it('authenticates using the legacy result and logs a structured mismatch when results disagree', async () => {
      const legacyUser = makeUser({ id: 'user-legacy', tenantId: 'tenant-a' });
      const { service, userRepo } = await createAuthService({
        findOneImpl: (opts) => (opts.where.tenantId ? null : legacyUser), // tenant-aware query finds nobody
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'shadow' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'tenant-b',
      );

      // Legacy result still wins -- login succeeds.
      expect(result).toHaveProperty('accessToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(2);

      const mismatchCall = warnSpy.mock.calls.find((c) =>
        typeof c[0] === 'string' && c[0].includes('login_tenant_scope_mismatch'),
      );
      expect(mismatchCall).toBeDefined();
      const logged = JSON.parse(mismatchCall![0] as string);
      expect(logged).toMatchObject({
        event: 'login_tenant_scope_mismatch',
        mode: 'shadow',
        username: 'testuser',
        requestTenantId: 'tenant-b',
        legacyUserId: 'user-legacy',
        tenantAwareUserId: null,
      });
    });

    it('duplicate usernames across tenants: authenticates with the legacy (first-match) user and logs the mismatch against the other tenant-scoped user', async () => {
      const legacyUser = makeUser({ id: 'user-tenant-a', tenantId: 'tenant-a' });
      const otherTenantUser = makeUser({ id: 'user-tenant-b', tenantId: 'tenant-b' });
      const { service, userRepo } = await createAuthService({
        findOneImpl: (opts) => (opts.where.tenantId === 'tenant-b' ? otherTenantUser : legacyUser),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'shadow' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'tenant-b',
      );

      expect(result.user.id).toBe('user-tenant-a'); // legacy result authenticated, not the tenant-b user
      expect(userRepo.findOne).toHaveBeenCalledTimes(2);

      const mismatchCall = warnSpy.mock.calls.find((c) =>
        typeof c[0] === 'string' && c[0].includes('login_tenant_scope_mismatch'),
      );
      expect(mismatchCall).toBeDefined();
      const logged = JSON.parse(mismatchCall![0] as string);
      expect(logged.legacyUserId).toBe('user-tenant-a');
      expect(logged.tenantAwareUserId).toBe('user-tenant-b');
    });

    it('missing tenant (requestTenantId undefined): skips the tenant-aware query entirely and authenticates via legacy lookup', async () => {
      const user = makeUser();
      const { service, userRepo } = await createAuthService({
        findOneImpl: () => user,
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'shadow' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', undefined,
      );

      expect(result).toHaveProperty('accessToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('login_tenant_scope_mismatch'));
    });
  });

  describe('login — LOGIN_TENANT_SCOPE_MODE=enforced', () => {
    it('missing tenant: throws UnauthorizedException immediately, without querying the database', async () => {
      const { service, userRepo } = await createAuthService({
        findOneImpl: () => makeUser(),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'enforced' },
      });

      await expect(
        service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('valid tenant, matching user: authenticates using only the tenant-scoped lookup', async () => {
      const user = makeUser({ tenantId: 'tenant-a' });
      const { service, userRepo } = await createAuthService({
        findOneImpl: (opts) => (opts.where.tenantId === 'tenant-a' ? user : null),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'enforced' },
      });

      const result = await service.login(
        { username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'tenant-a',
      );

      expect(result).toHaveProperty('accessToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(userRepo.findOne.mock.calls[0][0].where).toEqual({ username: 'testuser', tenantId: 'tenant-a' });
    });

    it('valid tenant, no matching user in that tenant: rejects even though a same-username user exists elsewhere', async () => {
      const otherTenantUser = makeUser({ id: 'user-tenant-b', tenantId: 'tenant-b' });
      const { service } = await createAuthService({
        findOneImpl: (opts) => (opts.where.tenantId === 'tenant-b' ? otherTenantUser : null),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'enforced' },
      });

      await expect(
        service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest', 'tenant-a'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('hisLogin — unaffected by LOGIN_TENANT_SCOPE_MODE', () => {
    it('resolves via findByHisEmployeeCode (not the username lookup) regardless of login scope mode', async () => {
      const hisUser = makeUser({
        id: 'his-user-1',
        hisEmployeeCode: 'EMP-001',
        roles: [{ id: 'role-1', name: 'STAFF', permissions: [{ key: 'TOKEN:ISSUE' }] }] as any,
      });
      const { service, userRepo, usersSvc } = await createAuthService({
        hisMappedUser: hisUser,
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'enforced' }, // arbitrary -- must not matter to hisLogin
        // hisLogin() validates hisBranchId against BranchService.getUserBranches()
        // -- must include 'branch-1' (the id passed below) or the unrelated
        // branch-access gate throws before this test's actual assertion is
        // ever reached.
        branchList: [{ id: 'branch-1', name: 'Branch 1' }],
      });

      const result = await service.hisLogin(
        { hisUsername: 'hisuser', hisBranchId: 'branch-1', hisDepartmentId: 'dept-1', hisServiceCenterId: 'sc-1' },
        '127.0.0.1', 'Jest', 'tenant-a',
      );

      expect(result).toHaveProperty('accessToken');
      expect(usersSvc.findByHisEmployeeCode).toHaveBeenCalledWith('EMP-001', 'tenant-a');
      expect(userRepo.findOne).not.toHaveBeenCalled(); // never touches the username-based path
    });

    it('missing tenant: throws UnauthorizedException before calling referenceSvc at all', async () => {
      const { service, referenceSvc } = await createAuthService({});

      await expect(
        service.hisLogin(
          { hisUsername: 'hisuser', hisBranchId: 'branch-1', hisDepartmentId: 'dept-1', hisServiceCenterId: 'sc-1' },
          '127.0.0.1', 'Jest', undefined,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(referenceSvc.getUserContext).not.toHaveBeenCalled();
    });

    it('rejects with ForbiddenException when the mapped user lacks TOKEN: permissions', async () => {
      const hisUser = makeUser({
        id: 'his-user-2',
        hisEmployeeCode: 'EMP-002',
        roles: [{ id: 'role-1', name: 'STAFF', permissions: [{ key: 'OTHER:PERM' }] }] as any,
      });
      const { service } = await createAuthService({ hisMappedUser: hisUser });

      await expect(
        service.hisLogin(
          { hisUsername: 'hisuser', hisBranchId: 'branch-1', hisDepartmentId: 'dept-1', hisServiceCenterId: 'sc-1' },
          '127.0.0.1', 'Jest', 'tenant-a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('refreshToken — unaffected by LOGIN_TENANT_SCOPE_MODE (resolves by id, not username)', () => {
    it('issues new tokens regardless of the configured login scope mode', async () => {
      const user = makeUser({ id: 'user-1' });
      const { service, userRepo, jwtSvc } = await createAuthService({
        findOneImpl: (opts) => (opts.where.id === 'user-1' ? user : null),
        configOverrides: { LOGIN_TENANT_SCOPE_MODE: 'enforced' }, // arbitrary -- must not matter
      });
      jwtSvc.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-old' });

      const result = await service.refreshToken('some-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
      expect(userRepo.findOne.mock.calls[0][0].where).toEqual({ id: 'user-1', isActive: true });
    });

    it('rejects an invalid/expired refresh token', async () => {
      const { service, jwtSvc } = await createAuthService({});
      jwtSvc.verify.mockImplementation(() => { throw new Error('expired'); });

      await expect(service.refreshToken('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a blacklisted (revoked) refresh token', async () => {
      const { service, redis } = await createAuthService({});
      redis.exists.mockResolvedValue(1);

      await expect(service.refreshToken('revoked-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login — JWT payload (ZoeConnect Identity Architecture Migration, Phase 2)', () => {
    it('stamps organizationId as an additive alias of tenantId, always equal, without dropping tenantId', async () => {
      const user = makeUser({ tenantId: 'tenant-a' });
      const { service, jwtSvc } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(jwtSvc.signAsync).toHaveBeenCalled();
      const [payload] = jwtSvc.signAsync.mock.calls[0];
      expect(payload.tenantId).toBe('tenant-a');
      expect(payload.organizationId).toBe('tenant-a');
      expect(payload.organizationId).toBe(payload.tenantId);
    });

    it('stamps organizationId as null when the user has no tenantId, mirroring tenantId', async () => {
      const user = makeUser({ tenantId: null as any });
      const { service, jwtSvc } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      const [payload] = jwtSvc.signAsync.mock.calls[0];
      expect(payload.tenantId).toBeNull();
      expect(payload.organizationId).toBeNull();
    });
  });

  describe('login — identifier / AUTH_IDENTITY_MODE (ZoeConnect Identity Architecture Migration, Phase 3)', () => {
    it('AUTH_IDENTITY_MODE=legacy (default): dto.identifier is ignored, dto.username still resolves via the existing tenant-scope-mode lookup', async () => {
      const user = makeUser({ tenantId: 'tenant-a' });
      const { service, userRepo } = await createAuthService({ findOneImpl: () => user });

      // Both fields present -- legacy mode must use `username` exactly as
      // before this phase, never touching the global (query-builder) path.
      await service.login({ identifier: 'someone@else.example', username: 'testuser', password: RAW_PASSWORD } as any, '127.0.0.1', 'Jest');

      expect(userRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { username: 'testuser' } }));
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('AUTH_IDENTITY_MODE=global: resolves a user by email via the case-insensitive username-OR-email lookup', async () => {
      const user = makeUser({ email: 'jane@example.com' });
      const { service, userRepo } = await createAuthService({
        configOverrides: { AUTH_IDENTITY_MODE: 'global' },
        queryBuilderGetOneImpl: () => user,
      });

      const result = await service.login(
        { identifier: 'Jane@Example.com', password: RAW_PASSWORD } as any,
        '127.0.0.1', 'Jest',
      );

      expect(userRepo.createQueryBuilder).toHaveBeenCalled();
      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
    });

    it('AUTH_IDENTITY_MODE=global: resolves a user by username too (not just email)', async () => {
      const user = makeUser();
      const { service } = await createAuthService({
        configOverrides: { AUTH_IDENTITY_MODE: 'global' },
        queryBuilderGetOneImpl: () => user,
      });

      const result = await service.login(
        { identifier: 'testuser', password: RAW_PASSWORD } as any,
        '127.0.0.1', 'Jest',
      );

      expect(result.accessToken).toBeDefined();
    });

    it('AUTH_IDENTITY_MODE=global: throws Invalid username or password when no user matches', async () => {
      const { service } = await createAuthService({
        configOverrides: { AUTH_IDENTITY_MODE: 'global' },
        queryBuilderGetOneImpl: () => null,
      });

      await expect(
        service.login({ identifier: 'nobody@example.com', password: RAW_PASSWORD } as any, '127.0.0.1', 'Jest'),
      ).rejects.toThrow('Invalid username or password');
    });

    it('AUTH_IDENTITY_MODE=global: refuses to log in (and never picks one arbitrarily) when the identifier matches more than one User row', async () => {
      // Production incident, 2026-08: "app.zoeconnect.in resolves a
      // different tenant than the website" -- root cause was
      // AUTH_IDENTITY_MODE=global relying on a global username/email
      // uniqueness invariant (1788500000000-GlobalIdentityUniqueness.ts)
      // that was not actually enforced in the database, so the same
      // identifier could match two different User rows (different tenants)
      // and `.getOne()` had no guaranteed way to pick the "right" one.
      const user = makeUser();
      const { service } = await createAuthService({
        configOverrides: { AUTH_IDENTITY_MODE: 'global' },
        queryBuilderGetOneImpl: () => user, // would have "succeeded" under the old getOne()-only behavior
        queryBuilderGetCountImpl: () => 2,  // but two rows actually match this identifier
      });

      await expect(
        service.login({ identifier: 'testuser', password: RAW_PASSWORD } as any, '127.0.0.1', 'Jest'),
      ).rejects.toThrow('Invalid username or password');
    });

    it('legacy `{ username, password }` payload (no identifier field at all) keeps working unmodified', async () => {
      const user = makeUser();
      const { service } = await createAuthService({ findOneImpl: () => user });

      const result = await service.login({ username: 'testuser', password: RAW_PASSWORD } as any, '127.0.0.1', 'Jest');

      expect(result.accessToken).toBeDefined();
    });

    it('an invalid AUTH_IDENTITY_MODE value falls back to legacy rather than crashing login', async () => {
      const user = makeUser();
      const { service, userRepo } = await createAuthService({
        findOneImpl: () => user,
        configOverrides: { AUTH_IDENTITY_MODE: 'not-a-real-mode' },
      });

      await service.login({ username: 'testuser', password: RAW_PASSWORD } as any, '127.0.0.1', 'Jest');

      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('login — cloud tenant auto-registration (login-time trigger)', () => {
    it('auto-registers a cloud tenant on successful login when deployment.mode is cloud', async () => {
      const user = makeUser({ tenantId: 'tenant-cloud-1' });
      const tenant = { id: 'tenant-cloud-1', name: 'MOSC Hospital', code: 'mosc' };
      const { service, vendorSyncService } = await createAuthService({
        findOneImpl: () => user,
        tenantRow: tenant,
        configOverrides: { 'deployment.mode': 'cloud' },
      });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(vendorSyncService.autoRegisterCloudTenant).toHaveBeenCalledWith('MOSC Hospital', 'mosc');
    });

    it('does not auto-register on a self-hosted login (default deployment.mode)', async () => {
      const user = makeUser();
      const { service, vendorSyncService, tenantRepo } = await createAuthService({
        findOneImpl: () => user,
      });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(vendorSyncService.autoRegisterCloudTenant).not.toHaveBeenCalled();
      // NOTE: tenantRepo.findOne() IS still called once here -- not for
      // auto-registration (which correctly never fires), but because
      // generateTokens()'s resolveTenantSlug(user.tenantId) resolves a
      // tenant-slug JWT claim for every login regardless of deployment
      // mode (self-hosted users have a real tenantId too, e.g. the default
      // tenant). That JWT-claim lookup is unrelated to this test's actual
      // subject (auto-registration gating) -- asserting it away was based
      // on an assumption that predates that feature.
      expect(tenantRepo.findOne).toHaveBeenCalledWith({ where: { id: user.tenantId } });
    });

    it('is a no-op for a tenant that is already registered (idempotent, handled inside VendorSyncService)', async () => {
      const user = makeUser({ tenantId: 'tenant-cloud-1' });
      const tenant = { id: 'tenant-cloud-1', name: 'MOSC Hospital', code: 'mosc' };
      const { service, vendorSyncService } = await createAuthService({
        findOneImpl: () => user,
        tenantRow: tenant,
        configOverrides: { 'deployment.mode': 'cloud' },
      });
      vendorSyncService.autoRegisterCloudTenant.mockResolvedValue({ id: 'already-registered' });

      const result = await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      // Login still succeeds normally regardless of what auto-registration returns.
      expect(result).toHaveProperty('accessToken');
      expect(vendorSyncService.autoRegisterCloudTenant).toHaveBeenCalledTimes(1);
    });

    it('never fails the login when auto-registration throws (non-fatal side effect)', async () => {
      const user = makeUser({ tenantId: 'tenant-cloud-1' });
      const tenant = { id: 'tenant-cloud-1', name: 'MOSC Hospital', code: 'mosc' };
      const { service, vendorSyncService } = await createAuthService({
        findOneImpl: () => user,
        tenantRow: tenant,
        configOverrides: { 'deployment.mode': 'cloud' },
      });
      vendorSyncService.autoRegisterCloudTenant.mockRejectedValue(new Error('concurrent race unresolved'));

      const result = await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(result).toHaveProperty('accessToken');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cloud tenant auto-registration'));
    });

    it('skips auto-registration entirely when the tenant row cannot be found (defensive)', async () => {
      const user = makeUser({ tenantId: 'tenant-cloud-missing' });
      const { service, vendorSyncService } = await createAuthService({
        findOneImpl: () => user,
        tenantRow: null,
        configOverrides: { 'deployment.mode': 'cloud' },
      });

      const result = await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(result).toHaveProperty('accessToken');
      expect(vendorSyncService.autoRegisterCloudTenant).not.toHaveBeenCalled();
    });
  });

  describe('idle-timeout settings tenant scoping (cross-tenant leak fix)', () => {
    it('login (via generateTokens/recordActivity) reads settings scoped to the new user\'s own tenant, not global', async () => {
      const user = makeUser({ tenantId: 'tenant-a' });
      const { service, settingsService } = await createAuthService({ findOneImpl: () => user });

      await service.login({ username: 'testuser', password: RAW_PASSWORD }, '127.0.0.1', 'Jest');

      expect(settingsService.getSettings).toHaveBeenCalledWith('tenant-a');
    });

    it('refreshToken() reads settings scoped to the tenant embedded in the refresh token\'s own payload, not ambient/global state', async () => {
      const user = makeUser({ id: 'user-1', tenantId: 'tenant-b' });
      const { service, userRepo, jwtSvc, settingsService } = await createAuthService({
        findOneImpl: (opts) => (opts.where.id === 'user-1' ? user : null),
      });
      jwtSvc.verify.mockReturnValue({ sub: 'user-1', jti: 'jti-old', tenantId: 'tenant-b' });

      await service.refreshToken('some-refresh-token');

      expect(userRepo.findOne).toHaveBeenCalled();
      expect(settingsService.getSettings).toHaveBeenCalledWith('tenant-b');
    });
  });

  describe('setupSuperAdmin branch-membership fix (2026-07-20 -- "0 accounts" bug for new cloud tenants)', () => {
    it('grants DEFAULT_BRANCH_ID membership when branchSvc.findAll() returns the synthetic Oracle-unavailable fallback (every cloud tenant)', async () => {
      const { service, userRepo, branchSvc } = await createAuthService({
        // BranchService.findAll()'s real fallback shape when Oracle is
        // down/unconfigured -- see branch.service.ts. This is exactly the
        // case the original fix's `branches.length === 0` check silently
        // never caught, since this array has length 1.
        branchList: [{ id: '2', name: 'Default Branch' }],
      });
      userRepo.createQueryBuilder.mockReturnValueOnce({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0), // setup required
      });

      await service.setupSuperAdmin(
        { username: 'newadmin', email: 'newadmin@example.com', password: 'Sup3rSecret!' },
        'tenant-cloud-1',
      );

      expect(branchSvc.assignBranches).toHaveBeenCalledWith(
        expect.any(String), ['2'], expect.any(String),
      );
    });

    it('does NOT grant DEFAULT_BRANCH_ID when branchSvc.findAll() returns real Oracle branches (self-hosted unaffected)', async () => {
      const { service, userRepo, branchSvc } = await createAuthService({
        branchList: [{ id: '10', name: 'Main Campus' }, { id: '11', name: 'Annex' }],
      });
      userRepo.createQueryBuilder.mockReturnValueOnce({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      });

      await service.setupSuperAdmin(
        { username: 'newadmin', email: 'newadmin@example.com', password: 'Sup3rSecret!' },
      );

      expect(branchSvc.assignBranches).not.toHaveBeenCalled();
    });
  });

  describe('setupSuperAdmin — global identity conflict check (ZoeConnect Identity Architecture Migration, Phase 4.1)', () => {
    it('throws ConflictException without creating a user when the username already exists (in any tenant)', async () => {
      const { service, userRepo } = await createAuthService();
      userRepo.createQueryBuilder
        .mockReturnValueOnce({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(0), // setup required
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getExists: jest.fn().mockResolvedValue(true), // username conflict
        });

      await expect(
        service.setupSuperAdmin({ username: 'taken', email: 'new@example.com', password: 'Sup3rSecret!' }),
      ).rejects.toThrow(ConflictException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('blacklists the JWT JTI in Redis', async () => {
      const user = makeUser();
      const { service, redis } = await createAuthService({ findOneImpl: () => user });

      await service.logout('user-1', 'jti-abc', '127.0.0.1');

      expect(redis.setex).toHaveBeenCalledWith(expect.stringContaining('jti-abc'), expect.any(Number), '1');
    });
  });
});
