import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { TenantScope } from './tenant-scope.interface';

interface TenantStore {
  tenantId: string | null;
  isSystem: boolean;
}

/**
 * Stage B (Checkpoint B2) — ambient per-request tenant context, backed by
 * Node's built-in `AsyncLocalStorage`. Chosen over a `Scope.REQUEST`
 * provider deliberately (see B1's log entry and the B2 pre-flight
 * discussion): no request-scoped DI, no constructor pollution, no threading
 * a tenant ID through every method signature between a controller and a
 * repository call ten layers deep.
 *
 * `AsyncLocalStorage` itself must be a single, process-wide instance (a
 * second instance would maintain a completely separate, unrelated context
 * stack) — kept as a module-level singleton here rather than something
 * `new`'d per class instance. `TenantContextInterceptor` is the only
 * intended caller of `run()`; `runAsSystem()` is the sole bypass mechanism,
 * used explicitly by callers who need to prove in review that they meant to
 * skip enforcement.
 *
 * Implements `TenantScope` so `TenantScopedRepository` can depend on the
 * interface rather than this concrete class (or `AsyncLocalStorage`
 * directly) — the repository layer never imports this file.
 *
 * Zero consumers as of B2: `TenantContextInterceptor` exists but is not
 * registered anywhere (no `APP_INTERCEPTOR`), and `TenantScopedRepository`
 * exists but is not provided by any module.
 */
const storage = new AsyncLocalStorage<TenantStore>();

@Injectable()
export class TenantContextStorage implements TenantScope {
  /** Runs `fn` with `tenantId` established as the ambient tenant for its entire async call graph. */
  static run<T>(tenantId: string, fn: () => T): T {
    return storage.run({ tenantId, isSystem: false }, fn);
  }

  /**
   * Runs `fn` in system scope: `TenantScopedRepository` (B2) will skip
   * enforcement entirely for any repository call made inside `fn`'s call
   * graph. Reserved for migrations, seeds, scheduled jobs, and admin
   * tooling — see the B2 pre-flight's bypass list in
   * `HYBRID_ARCHITECTURE_LOG.md`. Every use is a deliberate, reviewable
   * call site, not a flag threaded through unrelated code.
   */
  static runAsSystem<T>(fn: () => T): T {
    return storage.run({ tenantId: null, isSystem: true }, fn);
  }

  /** True if no `run()`/`runAsSystem()` context has been established at all (e.g. outside any request). */
  static hasContext(): boolean {
    return storage.getStore() !== undefined;
  }

  async currentTenantId(): Promise<string> {
    const store = storage.getStore();
    if (!store) {
      throw new Error(
        'TenantContextStorage.currentTenantId() called with no tenant context established. ' +
        'Wrap the call site in TenantContextStorage.run(tenantId, ...) or, if this is ' +
        'genuinely system-level code, TenantContextStorage.runAsSystem(...).',
      );
    }
    if (store.isSystem) {
      throw new Error(
        'TenantContextStorage.currentTenantId() called from within runAsSystem() — ' +
        'system scope has no tenant. Check isSystemScope() before calling this.',
      );
    }
    if (!store.tenantId) {
      throw new Error('TenantContextStorage store is corrupt: non-system scope with no tenantId.');
    }
    return store.tenantId;
  }

  isSystemScope(): boolean {
    return storage.getStore()?.isSystem ?? false;
  }

  /**
   * Stage B (Checkpoint B6, rescoped 2026-07-15) — convenience wrapper for
   * write-path tenant stamping. `TenantScopedRepository` deliberately does
   * not wrap `save()`/`create()` (see its own doc comment), so every
   * service that creates a new row must resolve and stamp `tenantId`
   * itself. Defensive by design: returns `null` rather than throwing when
   * no context is established (background/cron call sites, or any route
   * that hasn't opted into `TenantContextInterceptor` yet) or when running
   * in system scope. This is the single reusable implementation of the
   * pattern first proven in `AuditService.log()` — every B6 write-path fix
   * across every module calls this instead of re-deriving the same
   * hasContext()/isSystemScope()/currentTenantId() sequence inline.
   */
  async currentTenantIdOrNull(): Promise<string | null> {
    if (!TenantContextStorage.hasContext() || this.isSystemScope()) return null;
    return this.currentTenantId().catch(() => null);
  }

  /**
   * Fail-fast counterpart to `currentTenantIdOrNull()`, for write paths that
   * stamp `tenantId` onto a brand-new row of a tenant-owned entity. Added
   * 2026-08-07 after a real incident: `CmsDisplayController.create()` (and
   * three sibling routes — `CmsTickerController.create()`,
   * `DisplayController.create()` in the Token module, and
   * `TokenConfigController`'s `sc-configs` routes) called
   * `currentTenantIdOrNull()` from a controller route missing
   * `@UseInterceptors(TenantContextInterceptor)`, which silently returned
   * `null` and persisted rows with `tenant_id = NULL` — invisible to any
   * tenant-scoped list query, or unreachable for update/delete once one
   * existed. See HYBRID_ARCHITECTURE_LOG.md for the full write-up.
   *
   * `currentTenantIdOrNull()` remains correct and necessary for its
   * legitimate callers (background jobs, `runAsSystem()` call graphs, or
   * any write where a genuinely tenant-less row is a valid state) — this
   * method is NOT a replacement for it. Reach for `requireTenantContext()`
   * specifically at a write path where persisting `tenant_id = NULL` would
   * always be a bug, never a valid outcome: it turns a missing/miswired
   * tenant context into an immediate, loud `InternalServerErrorException`
   * (500) at the moment of the write, instead of a silently corrupt row
   * that only surfaces later as "my data disappeared."
   */
  async requireTenantContext(): Promise<string> {
    try {
      return await this.currentTenantId();
    } catch {
      throw new InternalServerErrorException(
        'Tenant context missing for a tenant-scoped write. This route is ' +
        'likely missing @UseInterceptors(TenantContextInterceptor), or is ' +
        'being invoked from a background/system call path that should use ' +
        'a genuinely tenant-less write instead of this method.',
      );
    }
  }
}
