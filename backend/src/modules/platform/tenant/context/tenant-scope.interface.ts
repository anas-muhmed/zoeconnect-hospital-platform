/**
 * Stage B (Checkpoint B2) — the only thing `TenantScopedRepository` is
 * allowed to depend on for "who is asking, and are they exempt."
 *
 * Deliberately narrow, per the design review: the repository layer must
 * never know about `AsyncLocalStorage`, sessions, JWTs, Oracle, or any
 * specific module (Feedback, Token, Attendance, ...). It only knows this
 * interface. `TenantContextStorage` (this checkpoint) is the first and, for
 * now, only implementation — backed by Node's `AsyncLocalStorage`, itself
 * populated by `TenantContextInterceptor` per request. Nothing about that
 * wiring is visible to, or assumed by, anything that consumes `TenantScope`.
 */
export interface TenantScope {
  /**
   * Resolves the current tenant's UUID. Callers in system scope should not
   * call this — check `isSystemScope()` first. Implementations may throw if
   * called with no tenant context established at all (neither a real
   * request context nor an explicit system-scope run).
   */
  currentTenantId(): Promise<string>;

  /**
   * True only inside an explicit `TenantContextStorage.runAsSystem(...)`
   * block (or equivalent). `TenantScopedRepository` uses this to decide
   * whether to skip enforcement — and only ever as the result of a
   * deliberate, visible-in-review caller decision, never a silent flag.
   */
  isSystemScope(): boolean;
}
