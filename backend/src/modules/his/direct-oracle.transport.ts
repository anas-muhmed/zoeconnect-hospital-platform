import { Injectable } from '@nestjs/common';
import { OraclePoolManager, OracleBindParameters } from './oracle-pool.service';
import { IOracleTransport } from '../platform/infrastructure/oracle/oracle-transport.interface';

/**
 * DirectOracleTransport (Phase 2 — Infrastructure Abstraction).
 *
 * Thin wrapper around `OraclePoolManager` (renamed from `OraclePoolService`,
 * 2026-07-21 — see that file's doc comment), giving it an
 * `IOracleTransport`-shaped front door for DI purposes. This is a pure
 * seam insertion: every method below delegates 1:1 to `OraclePoolManager`
 * with zero behavioural change here — the tenant-routing now happens
 * inside `OraclePoolManager` itself, transparent to this wrapper.
 */
@Injectable()
export class DirectOracleTransport implements IOracleTransport {
  constructor(private readonly pool: OraclePoolManager) {}

  get isAvailable(): boolean {
    return this.pool.isAvailable;
  }

  query<T = Record<string, unknown>>(
    sql: string,
    binds: OracleBindParameters = {},
    opts: { maxRows?: number; queryId?: string } = {},
  ): Promise<T[]> {
    // D.4: `queryId` is accepted-and-ignored here -- direct/self-hosted mode
    // has no allow-list to bypass, so it always executes the literal `sql`
    // string regardless. Only `maxRows` is forwarded to the pool, which
    // doesn't know about `queryId`.
    const { maxRows } = opts;
    return this.pool.query<T>(sql, binds, { maxRows });
  }

  queryOne<T = Record<string, unknown>>(
    sql: string,
    binds: OracleBindParameters = {},
    _opts: { queryId?: string } = {},
  ): Promise<T | null> {
    return this.pool.queryOne<T>(sql, binds);
  }

  execute(
    sql: string,
    binds: OracleBindParameters = {},
    _opts: { queryId?: string } = {},
  ): Promise<number> {
    return this.pool.execute(sql, binds);
  }

  reconfigure(
    creds: Record<string, string>,
    testOnly = false,
  ): Promise<{ ok: boolean; message: string }> {
    return this.pool.reconfigure(creds, testOnly);
  }
}
