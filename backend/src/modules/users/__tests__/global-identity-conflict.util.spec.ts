/**
 * ZoeConnect Identity Architecture Migration, Phase 4.1.
 *
 * Direct unit coverage for the one shared duplicate-check function every
 * user-management write path (UsersService.create()/update(),
 * AuthService.setupSuperAdmin(), HisConfigService.applyHdspUsers()) now
 * calls before attempting a write.
 */
import { ConflictException } from '@nestjs/common';
import { assertGlobalIdentityAvailable } from '../global-identity-conflict.util';

function mockUserRepo(opts: { usernameExists?: boolean; emailExists?: boolean } = {}) {
  const { usernameExists = false, emailExists = false } = opts;

  const calls: { field: 'username' | 'email'; value: string; excludeUserId?: string }[] = [];

  return {
    calls,
    createQueryBuilder: jest.fn((alias: string) => {
      let currentField: 'username' | 'email' | null = null;
      let currentValue = '';
      let currentExclude: string | undefined;

      const qb = {
        where: jest.fn((expr: string, params: Record<string, string>) => {
          if (expr.includes('username')) {
            currentField = 'username';
            currentValue = params.username;
          } else {
            currentField = 'email';
            currentValue = params.email;
          }
          return qb;
        }),
        andWhere: jest.fn((_expr: string, params: Record<string, string>) => {
          currentExclude = params.excludeUserId;
          return qb;
        }),
        getExists: jest.fn(async () => {
          calls.push({ field: currentField!, value: currentValue, excludeUserId: currentExclude });
          return currentField === 'username' ? usernameExists : emailExists;
        }),
      };
      return qb;
    }),
  };
}

describe('assertGlobalIdentityAvailable', () => {
  it('resolves without throwing when neither username nor email conflicts', async () => {
    const repo = mockUserRepo();
    await expect(
      assertGlobalIdentityAvailable(repo as any, { username: 'newuser', email: 'new@example.com' }),
    ).resolves.toBeUndefined();
  });

  it('throws ConflictException naming the username when only the username conflicts', async () => {
    const repo = mockUserRepo({ usernameExists: true });
    await expect(
      assertGlobalIdentityAvailable(repo as any, { username: 'taken', email: 'free@example.com' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      assertGlobalIdentityAvailable(mockUserRepo({ usernameExists: true }) as any, { username: 'taken', email: 'free@example.com' }),
    ).rejects.toThrow(/username "taken"/);
  });

  it('throws ConflictException naming the email when only the email conflicts', async () => {
    const repo = mockUserRepo({ emailExists: true });
    await expect(
      assertGlobalIdentityAvailable(repo as any, { username: 'free', email: 'taken@example.com' }),
    ).rejects.toThrow(/email "taken@example\.com"/);
  });

  it('names both fields when both conflict', async () => {
    const repo = mockUserRepo({ usernameExists: true, emailExists: true });
    await expect(
      assertGlobalIdentityAvailable(repo as any, { username: 'taken', email: 'taken@example.com' }),
    ).rejects.toThrow(/username "taken" and email "taken@example\.com"/);
  });

  it('is a no-op (no queries at all) when neither field is supplied', async () => {
    const repo = mockUserRepo();
    await assertGlobalIdentityAvailable(repo as any, {});
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('only checks the fields actually supplied -- omitting email skips the email query entirely', async () => {
    const repo = mockUserRepo({ emailExists: true }); // would conflict if checked
    await expect(
      assertGlobalIdentityAvailable(repo as any, { username: 'newuser' }),
    ).resolves.toBeUndefined();
    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0].field).toBe('username');
  });

  it('passes excludeUserId through to both queries, for updates excluding the user\'s own row', async () => {
    const repo = mockUserRepo();
    await assertGlobalIdentityAvailable(repo as any, { username: 'me', email: 'me@example.com', excludeUserId: 'user-1' });
    expect(repo.calls).toEqual([
      { field: 'username', value: 'me', excludeUserId: 'user-1' },
      { field: 'email', value: 'me@example.com', excludeUserId: 'user-1' },
    ]);
  });
});
