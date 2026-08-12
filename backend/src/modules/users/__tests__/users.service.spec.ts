import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { User } from '../entities/user.entity';
import { Role } from '../../rbac/entities/role.entity';
import { Permission } from '../../rbac/entities/permission.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { TenantContextService } from '../../platform/tenant/tenant-context.service';

// ZoeConnect Identity Architecture Migration, Phase 4.1 -- create()/update()
// now call assertGlobalIdentityAvailable(), which uses
// createQueryBuilder().where(...).andWhere(...).getExists(). `usernameExists`/
// `emailExists` let a test declare which of the two (if either) should be
// reported as already taken; the field is inferred from which column the
// `.where()` clause references, same technique as
// global-identity-conflict.util.spec.ts's own mock.
function mockUserRepo(
  user?: Partial<User> | null,
  conflicts: { usernameExists?: boolean; emailExists?: boolean } = {},
) {
  return {
    findOne: jest.fn().mockResolvedValue(user ?? null),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => ({ id: x.id ?? 'new-user-id', ...x })),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => {
      let field: 'username' | 'email' | null = null;
      const qb = {
        where: jest.fn((expr: string) => {
          field = expr.includes('username') ? 'username' : 'email';
          return qb;
        }),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn(async () =>
          field === 'username' ? !!conflicts.usernameExists : !!conflicts.emailExists,
        ),
      };
      return qb;
    }),
  };
}

function mockAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

// UsersService's real constructor also needs a TenantScopedRepository<User>
// (findAll()/findOne() only -- not exercised by these findByHisEmployeeCode()
// tests) and TenantContextStorage/TenantContextService (write-path tenant
// stamping, also not exercised here). Provided as bare stubs purely so
// Test.createTestingModule(...).compile() can resolve UsersService's full
// dependency graph -- none of these tests call a method that touches them.
// `getOneImpl` backs update()'s own findOne() (via the scoped repo), which
// runs BEFORE the duplicate check -- tests that exercise update() need this
// to return the user being updated.
function mockScopedUserRepo(getOneImpl?: () => any) {
  const getOne = jest.fn(async () => (getOneImpl ? getOneImpl() : null));
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne,
    })),
  };
}

function mockTenantContextStorage(tenantId: string | null = null) {
  return { currentTenantIdOrNull: jest.fn().mockResolvedValue(tenantId) };
}

function mockTenantContextService() {
  return { getCurrentTenantId: jest.fn().mockResolvedValue('default-tenant-id') };
}

function mockRoleRepo() {
  return { find: jest.fn().mockResolvedValue([]) };
}

interface CreateServiceOptions {
  user?: Partial<User> | null;
  conflicts?: { usernameExists?: boolean; emailExists?: boolean };
  tenantId?: string | null;
  scopedGetOneImpl?: () => any;
}

async function createService(opts: CreateServiceOptions = {}) {
  const userRepo = mockUserRepo(opts.user, opts.conflicts);
  const scopedUserRepo = mockScopedUserRepo(opts.scopedGetOneImpl);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: getRepositoryToken(User),       useValue: userRepo },
      { provide: getRepositoryToken(Role),       useValue: mockRoleRepo() },
      { provide: getRepositoryToken(Permission), useValue: {} },
      { provide: AuditService,                   useValue: mockAuditService() },
      { provide: getTenantScopedRepositoryToken(User), useValue: scopedUserRepo },
      { provide: TenantContextStorage,           useValue: mockTenantContextStorage(opts.tenantId ?? null) },
      { provide: TenantContextService,           useValue: mockTenantContextService() },
    ],
  }).compile();

  return { service: module.get(UsersService), userRepo, scopedUserRepo };
}

describe('UsersService.findByHisEmployeeCode', () => {
  // Tenant-Scoped User Identity, Task 2: tenantId is now a required second
  // parameter (see users.service.ts) -- every case below passes a fixed
  // 'tenant-1' and asserts it lands in the where clause.
  it('returns null without querying when the code is empty/falsy', async () => {
    const { service, userRepo } = await createService();
    expect(await service.findByHisEmployeeCode('', 'tenant-1')).toBeNull();
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns the matching active user (within the given tenant) with roles/permissions eagerly loaded', async () => {
    const user = {
      id: 'u1', username: 'nandakumar', hisEmployeeCode: '1042', isActive: true,
      tenantId: 'tenant-1', roles: [], directPermissions: [],
    };
    const { service, userRepo } = await createService({ user });

    const result = await service.findByHisEmployeeCode('1042', 'tenant-1');
    expect(result).toEqual(user);
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { hisEmployeeCode: '1042', isActive: true, tenantId: 'tenant-1' },
      relations: ['roles', 'roles.permissions', 'directPermissions'],
    });
  });

  it('returns null (not an exception) when no active user in that tenant has that code -- unmapped is expected, not an error', async () => {
    const { service } = await createService({ user: null });
    await expect(service.findByHisEmployeeCode('no-such-code', 'tenant-1')).resolves.toBeNull();
  });
});

describe('UsersService.create — global identity conflict check (ZoeConnect Identity Architecture Migration, Phase 4.1)', () => {
  it('throws ConflictException and never saves when the username is already taken (in any tenant)', async () => {
    const { service, userRepo } = await createService({
      tenantId: 'tenant-1',
      conflicts: { usernameExists: true },
    });

    await expect(
      service.create({ username: 'taken', email: 'new@example.com', password: 'Sup3rSecret!', roleIds: [] } as any, 'actor-1'),
    ).rejects.toThrow(ConflictException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('throws ConflictException and never saves when the email is already taken (in any tenant)', async () => {
    const { service, userRepo } = await createService({
      tenantId: 'tenant-1',
      conflicts: { emailExists: true },
    });

    await expect(
      service.create({ username: 'newuser', email: 'taken@example.com', password: 'Sup3rSecret!', roleIds: [] } as any, 'actor-1'),
    ).rejects.toThrow(ConflictException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('proceeds to save when neither username nor email conflicts', async () => {
    // create() ends with `return this.findOne(saved.id)`, which goes through
    // the scoped repo -- give it something to return so create() resolves
    // rather than throwing NotFoundException on its own final re-fetch.
    const { service, userRepo } = await createService({
      tenantId: 'tenant-1',
      scopedGetOneImpl: () => ({ id: 'new-user-id', username: 'newuser', email: 'new@example.com', roles: [] }),
    });

    await service.create({ username: 'newuser', email: 'new@example.com', password: 'Sup3rSecret!', roleIds: [] } as any, 'actor-1');

    expect(userRepo.save).toHaveBeenCalled();
  });
});

describe('UsersService.update — global identity conflict check (ZoeConnect Identity Architecture Migration, Phase 4.1)', () => {
  const existingUser = { id: 'u1', username: 'original', email: 'original@example.com', roles: [] } as any;

  it('throws ConflictException without updating when the new username is already taken by a different user', async () => {
    const { service, userRepo } = await createService({
      conflicts: { usernameExists: true },
      scopedGetOneImpl: () => existingUser,
    });

    await expect(
      service.update('u1', { username: 'taken' } as any, 'actor-1'),
    ).rejects.toThrow(ConflictException);
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('does not check (and does not throw) when username/email are unchanged from the user\'s own current values', async () => {
    const { service, userRepo } = await createService({
      conflicts: { usernameExists: true, emailExists: true }, // would conflict if (wrongly) checked
      scopedGetOneImpl: () => existingUser,
    });

    await service.update('u1', { username: 'original', email: 'original@example.com', fullName: 'New Name' } as any, 'actor-1');

    expect(userRepo.update).toHaveBeenCalled();
  });
});
