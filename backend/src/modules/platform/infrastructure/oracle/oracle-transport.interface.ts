export type OracleBindParameters = Record<string, unknown>;

/**
 * IOracleTransport (Phase 0 scaffolding — Hybrid Architecture roadmap).
 *
 * Defines the transport-agnostic contract for executing SQL against the
 * HIS Oracle database, shaped from today's `OraclePoolService` public
 * surface (`isAvailable`, `query`, `queryOne`, `execute`, `reconfigure`) so
 * that Phase 2's `DirectOracleTransport` (wrapping `OraclePoolService`
 * unchanged) and Phase 7's `CloudOracleTransport` (routing through the
 * Connector) can both implement it with the same method signatures.
 *
 * Phase 2 note: the original Phase 0 draft of this interface only declared
 * `isAvailable` / `query` / `execute`. Auditing `OraclePoolService`'s real
 * public surface against its actual consumers (his/billing, his/patient,
 * his/reference, his/sync, attendance/duty-actual-updater,
 * attendance/roster-resolver) found `queryOne` is called directly by six
 * of them, and `reconfigure` is called by the vendor-credential hot-swap
 * flow (licensing/license.controller.ts). Both are added here verbatim
 * (same signatures as `OraclePoolService`) rather than left off the
 * interface, so those consumers can migrate to `IOracleTransport` too
 * instead of being forced to keep a direct `OraclePoolService` dependency
 * just for these two methods.
 *
 * D.4 note ("Dynamic Per-Tenant HIS Query Architecture",
 * DYNAMIC_HIS_QUERY_ARCHITECTURE.md §9/§14): all three execution methods
 * now accept an optional `opts.queryId` -- a stable, tenant-independent
 * logical key (e.g. `'patient.getByMrn'`) that `CloudOracleTransport` uses
 * directly as the dispatched `sqlTemplateId`, bypassing its `sql`-string
 * allow-list entirely. `DirectOracleTransport` accepts and ignores it (self-
 * hosted mode always executes the literal `sql` string; it has no allow-
 * list to bypass). Callers not yet migrated to `queryId` are unaffected --
 * omitting `opts.queryId` preserves the exact prior behavior on both
 * transports.
 */
export interface IOracleTransport {
  readonly isAvailable: boolean;

  /**
   * Execute a SELECT query and return typed rows.
   */
  query<T = Record<string, unknown>>(
    sql: string,
    binds?: OracleBindParameters,
    opts?: { maxRows?: number; queryId?: string },
  ): Promise<T[]>;

  /**
   * Execute a query and return the first row or null.
   */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    binds?: OracleBindParameters,
    opts?: { queryId?: string },
  ): Promise<T | null>;

  /**
   * Execute a DML statement (INSERT / UPDATE / DELETE / MERGE).
   * Returns the number of rows affected.
   */
  execute(sql: string, binds?: OracleBindParameters, opts?: { queryId?: string }): Promise<number>;

  /**
   * Reconfigure the underlying Oracle pool with new credentials pushed
   * from the vendor portal (or verify connectivity only, when `testOnly`
   * is true). Same contract as `OraclePoolService.reconfigure()` — see
   * that implementation for the pool-swap / circuit-breaker interplay.
   */
  reconfigure(
    creds: Record<string, string>,
    testOnly?: boolean,
  ): Promise<{ ok: boolean; message: string }>;
}
