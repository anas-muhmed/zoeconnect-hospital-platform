import { Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { AvailabilityResponse, FieldAvailabilityResult } from './field-availability.types';

export interface FieldExistenceCheck<T extends ObjectLiteral = ObjectLiteral> {
  /** Key this result is returned under in the response's `fields` map, e.g. "username". */
  field: string;
  /** Repository for the entity being checked against. */
  repo: Repository<T>;
  /** Column to compare, using the query builder's SQL alias (see `alias` below), e.g. "username". */
  column: string;
  /**
   * Raw value submitted by the caller. A field is only checked when this is
   * truthy — an omitted/empty value is treated as "not requested," not as
   * "unavailable," letting callers pass every possible field through
   * unconditionally (e.g. from optional query params) without extra
   * branching.
   */
  value?: string | null;
  /**
   * Case-insensitive comparison via `LOWER()` on both sides. Defaults to
   * `true` — every identity-style field in this codebase today
   * (username/email) is compared case-insensitively at the DB constraint
   * level too (see `1788500000000-GlobalIdentityUniqueness.ts`), so this
   * mirrors that rather than silently drifting from it.
   */
  caseInsensitive?: boolean;
  /** Exclude this row's own id from the match — the "editing myself" case. */
  excludeId?: string;
  /** Column holding the row id, for `excludeId`. Defaults to 'id'. */
  idColumn?: string;
  /** Query-builder alias TypeORM uses for the generated SQL. Defaults to `field`. */
  alias?: string;
}

/**
 * Generic, reusable "does this value already exist" checker, shared across
 * every module that needs live uniqueness validation (username/email today;
 * Organization/Tenant/Client/Vendor Portal/Registration forms are expected
 * to call this exact service rather than each hand-rolling their own
 * existence query).
 *
 * Design notes:
 * - Runs a lightweight `SELECT EXISTS(...)` per field via TypeORM's
 *   `getExists()` — never hydrates or returns the matched row, so a check
 *   can't leak anything beyond a boolean.
 * - All requested fields run in parallel (`Promise.all`), not sequentially,
 *   so checking both `username` and `email` costs one round-trip's worth of
 *   latency, not two serial ones.
 * - Deliberately NOT exposed as a generic "check any table/column" HTTP
 *   endpoint. Each module keeps its own controller route, its own auth
 *   guards, and explicitly whitelists which columns are checkable — this
 *   service is the shared plumbing underneath that, not a public surface
 *   that could be pointed at arbitrary columns to enumerate table contents.
 * - This is an advisory pre-check for good UX (and a good error message),
 *   never a substitute for the DB-level unique constraint, which remains
 *   the actual source of truth — see `global-identity-conflict.util.ts`.
 */
@Injectable()
export class AvailabilityCheckService {
  async checkFields(checks: FieldExistenceCheck[]): Promise<AvailabilityResponse> {
    const requested = checks.filter((c) => !!c.value);
    const results = await Promise.all(requested.map((c) => this.checkOne(c)));

    const fields: Record<string, FieldAvailabilityResult> = {};
    requested.forEach((check, i) => { fields[check.field] = results[i]; });
    return { fields };
  }

  private async checkOne(check: FieldExistenceCheck): Promise<FieldAvailabilityResult> {
    const {
      repo, column, value, caseInsensitive = true,
      excludeId, idColumn = 'id', alias = check.field,
    } = check;

    const qb = repo.createQueryBuilder(alias);
    if (caseInsensitive) {
      qb.where(`LOWER(${alias}.${column}) = LOWER(:value)`, { value });
    } else {
      qb.where(`${alias}.${column} = :value`, { value });
    }
    if (excludeId) {
      qb.andWhere(`${alias}.${idColumn} != :excludeId`, { excludeId });
    }

    const exists = await qb.getExists();
    return exists ? { available: false, reason: 'already_exists' } : { available: true };
  }
}
