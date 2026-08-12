import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

/**
 * ZoeConnect Identity Architecture Migration, Phase 4.1 (application-layer
 * duplicate validation).
 *
 * Phase 4's `1788500000000-GlobalIdentityUniqueness.ts` migration made
 * `users.username`/`users.email` globally unique (case-insensitive) at the
 * DATABASE level. That constraint is the final safety net, but every write
 * path that previously ran a TENANT-SCOPED duplicate pre-check (from the
 * era when the DB constraint itself was tenant-scoped) now has a gap: a
 * genuine cross-tenant collision sails past that narrower pre-check and
 * hits the global unique index at `save()` time instead, surfacing as a raw
 * driver-level `QueryFailedError` (Postgres `23505`) -- an unfriendly 500,
 * not the `ConflictException` (409) a person submitting a create/update
 * form should see.
 *
 * This is the one, single place that check is implemented, so every write
 * path -- `UsersService.create()`, `UsersService.update()`,
 * `AuthService.setupSuperAdmin()`, `HisConfigService.applyHdspUsers()` --
 * calls the exact same query rather than five slightly-different
 * reimplementations of it. A plain exported function (not a NestJS
 * `@Injectable()`) deliberately -- every call site already holds its own
 * `@InjectRepository(User)` repository, so this needs no module wiring/DI
 * registration of its own and introduces no new inter-module dependency.
 *
 * Callers MUST await this before attempting the write; the DB index still
 * has the final word (e.g. a genuine race between two concurrent requests),
 * so this is a pre-check for a good error message, not a substitute for the
 * constraint itself.
 */
export async function assertGlobalIdentityAvailable(
  userRepo: Repository<User>,
  params: {
    username?: string | null;
    email?: string | null;
    /** Exclude this user's own row -- an update naturally "conflicts" with itself otherwise. */
    excludeUserId?: string;
  },
): Promise<void> {
  const { username, email, excludeUserId } = params;
  const conflicts: string[] = [];
  // Structured, field-keyed record of what collided -- lets callers (the
  // Users form, chiefly) map this back onto the specific input field
  // instead of parsing the free-text `message` below. Added alongside the
  // reusable AvailabilityCheckService/frontend availability-check work so a
  // race between a client-side "is this available" pre-check and another
  // request's write at submit time still surfaces as a field-level error,
  // not just a generic toast.
  const conflictFields: string[] = [];

  // Two separate targeted queries (not one combined OR) so a username
  // collision against one existing row and an email collision against a
  // DIFFERENT existing row are both reported -- a single OR'd query's
  // `getOne()` would only surface whichever row Postgres returns first.
  if (username) {
    const qb = userRepo.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username });
    if (excludeUserId) qb.andWhere('user.id != :excludeUserId', { excludeUserId });
    if (await qb.getExists()) { conflicts.push(`username "${username}"`); conflictFields.push('username'); }
  }

  if (email) {
    const qb = userRepo.createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email });
    if (excludeUserId) qb.andWhere('user.id != :excludeUserId', { excludeUserId });
    if (await qb.getExists()) { conflicts.push(`email "${email}"`); conflictFields.push('email'); }
  }

  if (conflicts.length > 0) {
    throw new ConflictException({
      message: `${conflicts.join(' and ')} already in use.`,
      error: 'Conflict',
      statusCode: 409,
      conflictFields,
    });
  }
}
