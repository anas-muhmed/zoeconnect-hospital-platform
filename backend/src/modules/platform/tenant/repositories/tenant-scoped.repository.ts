import { Logger } from '@nestjs/common';
import {
  Repository,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  SelectQueryBuilder,
  UpdateResult,
  DeleteResult,
  ObjectLiteral,
} from 'typeorm';
import type { TenantScope } from '../context/tenant-scope.interface';

export type TenantEnforcementMode = 'enforced' | 'dry-run';

export interface TenantScopedRepositoryOptions {
  /**
   * 'enforced' (default) actually applies the `tenant_id` predicate.
   * 'dry-run' runs the query exactly as an unwrapped repository would
   * (i.e. current production behavior, unfiltered), then separately checks
   * what the enforced result would have been and logs any mismatch. B2.5
   * is the checkpoint that turns this on for real consumers; the option
   * exists here in B2 purely as built infrastructure — nothing constructs
   * this class yet, so the default has no observable effect.
   */
  mode?: TenantEnforcementMode;
}

/**
 * Stage B (Checkpoint B2) — Repository/Read-Side Enforcement Mechanism.
 *
 * Wraps (never replaces) a TypeORM `Repository<T>`. `T` is assumed to carry
 * a nullable `tenantId` column — every entity Stage A added one to. This
 * class is the single enforcement seam per the B2 pre-flight: no
 * module-by-module `.where('tenant_id = ...')` sprinkling, one mechanism
 * that B3 enables per module by swapping which token a service injects.
 *
 * Depends only on `TenantScope` (see `../context/tenant-scope.interface.ts`)
 * — never imports `TenantContextStorage`, `AsyncLocalStorage`, sessions,
 * JWTs, or any specific module. `TenantContextStorage` is simply the first
 * implementation this gets constructed with.
 *
 * Deliberately excludes `save()`/`insert()`/`upsert()` — write-path tenant
 * stamping is Stage B Checkpoint B6's responsibility, not B2's, per the
 * design review that separated read-enforcement infrastructure from
 * write-path stamping.
 *
 * `createQueryBuilder()` is always scoped — there is no unscoped escape
 * hatch reachable by accident. A caller who genuinely needs an unscoped
 * query builder must reach for `createSystemQueryBuilder()` explicitly, a
 * different, deliberately-named method that shows up in review and in a
 * grep for "System" the same way `TenantContextStorage.runAsSystem()` does.
 *
 * Zero consumers as of B2: nothing constructs an instance of this class
 * outside its own unit tests. Module opt-in is B3's job.
 */
export class TenantScopedRepository<T extends ObjectLiteral> {
  private readonly logger = new Logger(TenantScopedRepository.name);
  private readonly mode: TenantEnforcementMode;

  constructor(
    private readonly repo: Repository<T>,
    private readonly tenantScope: TenantScope,
    options: TenantScopedRepositoryOptions = {},
  ) {
    this.mode = options.mode ?? 'enforced';
  }

  private get entityName(): string {
    return this.repo.metadata.name;
  }

  private async tenantPredicate(): Promise<FindOptionsWhere<T> | null> {
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return null;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    return { tenantId } as unknown as FindOptionsWhere<T>;
  }

  private mergeWhere(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
    predicate: FindOptionsWhere<T>,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (!where) return predicate;
    if (Array.isArray(where)) {
      return where.map((w) => ({ ...w, ...predicate }));
    }
    return { ...where, ...predicate };
  }

  // ── Reads ────────────────────────────────────────────────────────────

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    if (this.mode === 'dry-run') return this.findDryRun(options);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.find(options);
    return this.repo.find({ ...options, where: this.mergeWhere(options?.where, predicate) });
  }

  async findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    if (this.mode === 'dry-run') return this.findByDryRun(where);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.findBy(where);
    return this.repo.findBy(this.mergeWhere(where, predicate));
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    if (this.mode === 'dry-run') return this.findOneDryRun(options);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.findOne(options);
    return this.repo.findOne({
      ...options,
      where: this.mergeWhere(options.where as FindOptionsWhere<T> | undefined, predicate),
    });
  }

  async findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    if (this.mode === 'dry-run') return this.findOneByDryRun(where);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.findOneBy(where);
    return this.repo.findOneBy(this.mergeWhere(where, predicate));
  }

  async count(options?: FindManyOptions<T>): Promise<number> {
    if (this.mode === 'dry-run') return this.countDryRun(options);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.count(options);
    return this.repo.count({ ...options, where: this.mergeWhere(options?.where, predicate) });
  }

  /**
   * Added during B3.1 (Notification pilot) — `NotificationService.findLogs()`
   * needs paginated list-with-total, which `find()`/`count()` alone can't
   * give atomically. Same predicate-injection shape as every other read
   * method here; not a new enforcement concept, just filling a gap in the
   * original method list once real call-site usage surfaced it.
   */
  async findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    if (this.mode === 'dry-run') return this.findAndCountDryRun(options);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.findAndCount(options);
    return this.repo.findAndCount({ ...options, where: this.mergeWhere(options?.where, predicate) });
  }

  async exist(options?: FindManyOptions<T>): Promise<boolean> {
    if (this.mode === 'dry-run') return this.existDryRun(options);
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.exist(options);
    return this.repo.exist({ ...options, where: this.mergeWhere(options?.where, predicate) });
  }

  /**
   * Scoped when `mode: 'enforced'` (the default). This is the one difference
   * from a raw `Repository`'s `createQueryBuilder()` the pre-flight review
   * specifically called out — there is deliberately no unscoped variant
   * reachable under this name outside of dry-run/system scope.
   *
   * When `mode: 'dry-run'`, the returned builder is deliberately left
   * unscoped (matching current production behavior, zero behavior change) —
   * only a debug/warn comparison log fires, mirroring every other dry-run
   * method here. A caller mid-dry-run window must not have its query
   * results narrowed, or the dry-run window stops being a faithful measure
   * of "what would enforcement actually do."
   */
  async createQueryBuilder(alias?: string): Promise<SelectQueryBuilder<T>> {
    const qb = this.repo.createQueryBuilder(alias);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return qb;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    if (this.mode === 'dry-run') {
      this.logger.debug(
        `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
        `createQueryBuilder() left unscoped (no per-row comparison available for arbitrary query builders)`,
      );
      return qb;
    }
    const column = alias ? `${alias}.tenantId` : 'tenantId';
    return qb.andWhere(`${column} = :tenantScopedTenantId`, { tenantScopedTenantId: tenantId });
  }

  /**
   * Explicit, named escape hatch for the rare case a caller genuinely needs
   * an unscoped query builder outside system scope (e.g. a cross-tenant
   * admin report). Its name is deliberately loud — greppable, and
   * unmistakable in review, the same way `runAsSystem()` is.
   */
  createSystemQueryBuilder(alias?: string): SelectQueryBuilder<T> {
    this.logger.debug(`Tenant filter bypassed via createSystemQueryBuilder() — entity=${this.entityName}`);
    return this.repo.createQueryBuilder(alias);
  }

  // ── Writes (update/delete only — save/insert/upsert deferred to B6) ───

  async update(
    criteria: FindOptionsWhere<T>,
    partialEntity: Parameters<Repository<T>['update']>[1],
  ): Promise<UpdateResult> {
    if (this.mode === 'dry-run') {
      this.logger.debug(`Tenant filter dry run — entity=${this.entityName}, mode=dry-run, update() left unscoped`);
      return this.repo.update(criteria, partialEntity);
    }
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.update(criteria, partialEntity);
    return this.repo.update(this.mergeWhere(criteria, predicate), partialEntity);
  }

  async delete(criteria: FindOptionsWhere<T>): Promise<DeleteResult> {
    if (this.mode === 'dry-run') {
      this.logger.debug(`Tenant filter dry run — entity=${this.entityName}, mode=dry-run, delete() left unscoped`);
      return this.repo.delete(criteria);
    }
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.delete(criteria);
    return this.repo.delete(this.mergeWhere(criteria, predicate));
  }

  async softDelete(criteria: FindOptionsWhere<T>): Promise<UpdateResult> {
    if (this.mode === 'dry-run') {
      this.logger.debug(`Tenant filter dry run — entity=${this.entityName}, mode=dry-run, softDelete() left unscoped`);
      return this.repo.softDelete(criteria);
    }
    const predicate = await this.tenantPredicate();
    if (!predicate) return this.repo.softDelete(criteria);
    return this.repo.softDelete(this.mergeWhere(criteria, predicate));
  }

  // ── Dry-run (mode: 'dry-run') ───────────────────────────────────────

  /**
   * Logging-only shadow mode for `find()` — B2.5's mechanism, built here so
   * B2.5 is pure configuration. Runs the query exactly as production does
   * today (unfiltered — zero behavior change) and separately counts what
   * the enforced result would have been, logging any mismatch. Only
   * `find()` gets the full before/after comparison; other methods log
   * intent only (see `tenantPredicate()`'s own debug log for the
   * system-scope case, which fires regardless of mode).
   */
  private async findDryRun(options?: FindManyOptions<T>): Promise<T[]> {
    const actual = await this.repo.find(options);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const predicate = { tenantId } as unknown as FindOptionsWhere<T>;
    const wouldRemain = await this.repo.count({
      ...options,
      where: this.mergeWhere(options?.where, predicate),
    });
    const mismatch = wouldRemain !== actual.length;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `rowsReturned(unfiltered)=${actual.length}, rowsThatWouldRemain(filtered)=${wouldRemain}` +
      (mismatch ? ' — MISMATCH' : ''),
    );
    return actual;
  }

  /** `findAndCount()`'s dry-run counterpart — same shape as `findDryRun()`. */
  private async findAndCountDryRun(options?: FindManyOptions<T>): Promise<[T[], number]> {
    const [actualRows, actualTotal] = await this.repo.findAndCount(options);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return [actualRows, actualTotal];
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const predicate = { tenantId } as unknown as FindOptionsWhere<T>;
    const wouldRemain = await this.repo.count({
      ...options,
      where: this.mergeWhere(options?.where, predicate),
    });
    const mismatch = wouldRemain !== actualTotal;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `rowsReturned(unfiltered)=${actualTotal}, rowsThatWouldRemain(filtered)=${wouldRemain}` +
      (mismatch ? ' — MISMATCH' : ''),
    );
    return [actualRows, actualTotal];
  }

  /** `findBy()`'s dry-run counterpart — same shape as `findDryRun()`. */
  private async findByDryRun(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    const actual = await this.repo.findBy(where);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const predicate = { tenantId } as unknown as FindOptionsWhere<T>;
    const wouldRemain = await this.repo.count({ where: this.mergeWhere(where, predicate) });
    const mismatch = wouldRemain !== actual.length;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `rowsReturned(unfiltered)=${actual.length}, rowsThatWouldRemain(filtered)=${wouldRemain}` +
      (mismatch ? ' — MISMATCH' : ''),
    );
    return actual;
  }

  /**
   * `findOne()`'s dry-run counterpart. A single-row mismatch is checked by
   * comparing the fetched row's own `tenantId` (or system scope) against the
   * current tenant, rather than a separate count query — cheaper and just
   * as accurate for a single row.
   */
  private async findOneDryRun(options: FindOneOptions<T>): Promise<T | null> {
    const actual = await this.repo.findOne(options);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const actualTenantId = (actual as unknown as { tenantId?: string | null } | null)?.tenantId ?? null;
    const mismatch = actual !== null && actualTenantId !== tenantId;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `found=${actual !== null}, rowTenantId=${actualTenantId ?? 'null'}` +
      (mismatch ? ' — MISMATCH (row belongs to a different tenant, or has no tenantId stamped yet)' : ''),
    );
    return actual;
  }

  /** `findOneBy()`'s dry-run counterpart — same comparison shape as `findOneDryRun()`. */
  private async findOneByDryRun(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    const actual = await this.repo.findOneBy(where);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const actualTenantId = (actual as unknown as { tenantId?: string | null } | null)?.tenantId ?? null;
    const mismatch = actual !== null && actualTenantId !== tenantId;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `found=${actual !== null}, rowTenantId=${actualTenantId ?? 'null'}` +
      (mismatch ? ' — MISMATCH (row belongs to a different tenant, or has no tenantId stamped yet)' : ''),
    );
    return actual;
  }

  /** `count()`'s dry-run counterpart — same shape as `findDryRun()`. */
  private async countDryRun(options?: FindManyOptions<T>): Promise<number> {
    const actual = await this.repo.count(options);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const predicate = { tenantId } as unknown as FindOptionsWhere<T>;
    const wouldRemain = await this.repo.count({ ...options, where: this.mergeWhere(options?.where, predicate) });
    const mismatch = wouldRemain !== actual;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `countReturned(unfiltered)=${actual}, countThatWouldRemain(filtered)=${wouldRemain}` +
      (mismatch ? ' — MISMATCH' : ''),
    );
    return actual;
  }

  /** `exist()`'s dry-run counterpart — same shape as `countDryRun()`. */
  private async existDryRun(options?: FindManyOptions<T>): Promise<boolean> {
    const actual = await this.repo.exist(options);
    if (this.tenantScope.isSystemScope()) {
      this.logger.debug(`Tenant filter skipped — entity=${this.entityName}, reason=System scope`);
      return actual;
    }
    const tenantId = await this.tenantScope.currentTenantId();
    const predicate = { tenantId } as unknown as FindOptionsWhere<T>;
    const wouldExist = await this.repo.exist({ ...options, where: this.mergeWhere(options?.where, predicate) });
    const mismatch = wouldExist !== actual;
    this.logger[mismatch ? 'warn' : 'debug'](
      `Tenant filter dry run — entity=${this.entityName}, tenant=${tenantId}, mode=dry-run, ` +
      `existsUnfiltered=${actual}, existsFiltered=${wouldExist}` +
      (mismatch ? ' — MISMATCH' : ''),
    );
    return actual;
  }
}
