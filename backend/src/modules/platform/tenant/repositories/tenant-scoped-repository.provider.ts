import { Provider, Type } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, ObjectLiteral } from 'typeorm';
import { TenantContextStorage } from '../context/tenant-context-storage';
import { TenantScopedRepository, TenantScopedRepositoryOptions } from './tenant-scoped.repository';

/**
 * Stage B (Checkpoint B2) — DI plumbing for `TenantScopedRepository`.
 *
 * `getTenantScopedRepositoryToken(Entity)` gives a distinct injection token
 * per entity, deliberately separate from `getRepositoryToken(Entity)` (the
 * raw TypeORM repository's own token) so a module can hold both
 * side-by-side during its B3 migration — inject the raw repository where
 * still needed and the scoped one where enforcement is being turned on,
 * rather than an all-or-nothing swap.
 *
 * `createTenantScopedRepositoryProvider(Entity)` is what a module adds to
 * its own `providers` array in B3 to opt in — nothing calls this in B2.
 * The entity must already have a `tenant_id` column (i.e. it went through
 * Stage A) and a `tenantId` TypeScript property for `TenantScopedRepository`
 * to type-check and query against correctly.
 */
export function getTenantScopedRepositoryToken(entity: Type<unknown>): string {
  return `TenantScopedRepository_${entity.name}`;
}

export function createTenantScopedRepositoryProvider<T extends ObjectLiteral>(
  entity: Type<T>,
  options?: TenantScopedRepositoryOptions,
): Provider {
  return {
    provide: getTenantScopedRepositoryToken(entity),
    useFactory: (repo: Repository<T>, tenantScope: TenantContextStorage) =>
      new TenantScopedRepository<T>(repo, tenantScope, options),
    inject: [getRepositoryToken(entity), TenantContextStorage],
  };
}
