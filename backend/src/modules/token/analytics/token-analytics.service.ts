import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TokenAnalyticsService
 *
 * Nightly cron (00:15 every day) that aggregates token_records into
 * token_analytics_daily for the previous day.
 *
 * The 15-minute offset avoids midnight contention with daily sequence resets.
 * Can also be called manually for backfill via aggregateDate(date).
 */
@Injectable()
export class TokenAnalyticsService {
  private readonly logger = new Logger(TokenAnalyticsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Run every day at 00:15
  @Cron('15 0 * * *', { name: 'token-analytics-daily' })
  async runNightlyAggregation(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    this.logger.log(`Starting nightly token analytics aggregation for ${dateStr}`);
    try {
      await this.aggregateDate(dateStr);
      this.logger.log(`Analytics aggregation complete for ${dateStr}`);
    } catch (err) {
      this.logger.error(`Analytics aggregation failed for ${dateStr}`, err);
    }
  }

  /**
   * Aggregate all token_records for a given date into token_analytics_daily.
   * Uses INSERT ... ON CONFLICT DO UPDATE (upsert) so it is safe to re-run.
   */
  async aggregateDate(dateStr: string): Promise<void> {
    // Phase 8 (Task 8.6): token_records.tenant_id was backfilled to the
    // seeded 'default' tenant's UUID for every pre-Phase-8 row (see
    // AddTenantIdToTokenTables's migration), so it's safe to thread
    // straight through the GROUP BY -- exactly the follow-up this table's
    // own entity doc comment flagged when the column was first added.
    await this.dataSource.query(`
      INSERT INTO token_analytics_daily (
        branch_id, reference_type, reference_id, analytics_date,
        total_issued, total_called, total_completed, total_missed,
        total_cancelled, total_on_hold,
        avg_wait_seconds, avg_serve_seconds,
        peak_hour, peak_hour_volume,
        by_type, by_counter, tenant_id
      )
      SELECT
        branch_id,
        reference_type,
        reference_id,
        $1::date AS analytics_date,

        COUNT(*)                                                           AS total_issued,
        COUNT(*) FILTER (WHERE status IN ('CALLED','SERVING','COMPLETED')) AS total_called,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')                       AS total_completed,
        COUNT(*) FILTER (WHERE status = 'MISSED')                          AS total_missed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')                       AS total_cancelled,
        COUNT(*) FILTER (WHERE status = 'ON_HOLD')                         AS total_on_hold,

        -- Average wait: issued_at to called_at for completed records
        AVG(
          EXTRACT(EPOCH FROM (called_at - issued_at))
        ) FILTER (WHERE called_at IS NOT NULL)::INT                        AS avg_wait_seconds,

        -- Average serve: called_at to completed_at for completed records
        AVG(
          EXTRACT(EPOCH FROM (completed_at - called_at))
        ) FILTER (WHERE completed_at IS NOT NULL AND called_at IS NOT NULL)::INT AS avg_serve_seconds,

        -- Peak hour: the hour with the most issued tokens
        (
          SELECT EXTRACT(HOUR FROM issued_at)::SMALLINT
          FROM token_records sub
          WHERE sub.branch_id      = main.branch_id
            AND sub.reference_type = main.reference_type
            AND sub.reference_id   = main.reference_id
            AND sub.issued_at::date = $1::date
          GROUP BY EXTRACT(HOUR FROM issued_at)
          ORDER BY COUNT(*) DESC
          LIMIT 1
        )                                                                  AS peak_hour,

        (
          SELECT COUNT(*)::INT
          FROM token_records sub
          WHERE sub.branch_id      = main.branch_id
            AND sub.reference_type = main.reference_type
            AND sub.reference_id   = main.reference_id
            AND sub.issued_at::date = $1::date
          GROUP BY EXTRACT(HOUR FROM issued_at)
          ORDER BY COUNT(*) DESC
          LIMIT 1
        )                                                                  AS peak_hour_volume,

        -- Breakdown by token type
        jsonb_object_agg(
          token_type, type_count
        ) FILTER (WHERE token_type IS NOT NULL)                            AS by_type,

        -- Breakdown by counter (id -> count)
        (
          SELECT COALESCE(jsonb_object_agg(counter_id::text, cnt), '{}')
          FROM (
            SELECT counter_id, COUNT(*) AS cnt
            FROM token_records sub2
            WHERE sub2.branch_id      = main.branch_id
              AND sub2.reference_type = main.reference_type
              AND sub2.reference_id   = main.reference_id
              AND sub2.issued_at::date = $1::date
              AND sub2.counter_id IS NOT NULL
            GROUP BY counter_id
          ) ctr
        )                                                                  AS by_counter,

        -- Tenant Foundation (A13) backfilled every token_records row's
        -- tenant_id; MAX() is a no-op aggregation since it's uniform per
        -- branch, just satisfies GROUP BY without adding it as a grouping key.
        MAX(tenant_id)                                                    AS tenant_id

      FROM (
        SELECT
          branch_id, reference_type, reference_id, status,
          called_at, issued_at, completed_at,
          token_type, tenant_id,
          COUNT(*) OVER (
            PARTITION BY branch_id, reference_type, reference_id, token_type
          ) AS type_count
        FROM token_records
        WHERE issued_at::date = $1::date
      ) main
      GROUP BY branch_id, reference_type, reference_id

      ON CONFLICT (branch_id, reference_type, reference_id, analytics_date)
      DO UPDATE SET
        total_issued     = EXCLUDED.total_issued,
        total_called     = EXCLUDED.total_called,
        total_completed  = EXCLUDED.total_completed,
        total_missed     = EXCLUDED.total_missed,
        total_cancelled  = EXCLUDED.total_cancelled,
        total_on_hold    = EXCLUDED.total_on_hold,
        avg_wait_seconds = EXCLUDED.avg_wait_seconds,
        avg_serve_seconds = EXCLUDED.avg_serve_seconds,
        peak_hour        = EXCLUDED.peak_hour,
        peak_hour_volume = EXCLUDED.peak_hour_volume,
        by_type          = EXCLUDED.by_type,
        by_counter       = EXCLUDED.by_counter,
        tenant_id        = EXCLUDED.tenant_id
    `, [dateStr]);
  }

  /** Returns analytics rows for a branch, date range, optionally filtered by reference */
  async getAnalytics(opts: {
    branchId:       string;
    from:           string;
    to:             string;
    referenceType?: string;
    referenceId?:   string;
  }): Promise<unknown[]> {
    const params: unknown[] = [opts.branchId, opts.from, opts.to];
    let refFilter = '';

    if (opts.referenceType) {
      params.push(opts.referenceType);
      refFilter += ` AND reference_type = $${params.length}`;
    }
    if (opts.referenceId) {
      params.push(opts.referenceId);
      refFilter += ` AND reference_id = $${params.length}`;
    }

    // A5.5 API Contract Audit: was `SELECT *`, which included tenant_id in
    // the raw-SQL result (raw pg rows return every column verbatim, no
    // entity/DTO layer in between) -- explicit column list excludes it.
    return this.dataSource.query(
      `SELECT
         id, branch_id, reference_type, reference_id, analytics_date,
         total_issued, total_called, total_completed, total_missed, total_cancelled,
         total_on_hold, avg_wait_seconds, avg_serve_seconds, peak_hour, peak_hour_volume,
         by_type, by_counter, created_at
       FROM token_analytics_daily
        WHERE branch_id = $1
          AND analytics_date BETWEEN $2::date AND $3::date
          ${refFilter}
        ORDER BY analytics_date DESC, reference_id ASC`,
      params,
    );
  }

  /** Trigger a manual backfill for a specific date (admin use) */
  async backfill(dateStr: string): Promise<{ date: string; ok: boolean }> {
    await this.aggregateDate(dateStr);
    return { date: dateStr, ok: true };
  }

  // ── GAP-13: Spec-required analytics endpoints ─────────────────────────────

  /**
   * Daily summary for a single date -- totals + avg wait/serve for the branch.
   * Reads token_analytics_daily (pre-aggregated) for past dates, token_records for today.
   */
  async getSummary(opts: {
    branchId: string;
    date:     string;
  }): Promise<unknown> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT
         branch_id,
         $2::date                      AS analytics_date,
         SUM(total_issued)::INT        AS total_issued,
         SUM(total_called)::INT        AS total_called,
         SUM(total_completed)::INT     AS total_completed,
         SUM(total_missed)::INT        AS total_missed,
         SUM(total_cancelled)::INT     AS total_cancelled,
         AVG(avg_wait_seconds)::INT    AS avg_wait_seconds,
         AVG(avg_serve_seconds)::INT   AS avg_serve_seconds
       FROM token_analytics_daily
       WHERE branch_id = $1
         AND analytics_date = $2::date
       GROUP BY branch_id`,
      [opts.branchId, opts.date],
    );
    return rows[0] ?? null;
  }

  /**
   * Daily token volume over a date range -- one row per date, summed across references.
   */
  async getVolume(opts: {
    branchId: string;
    from:     string;
    to:       string;
  }): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT
         analytics_date,
         SUM(total_issued)::INT    AS total_issued,
         SUM(total_called)::INT    AS total_called,
         SUM(total_completed)::INT AS total_completed,
         SUM(total_missed)::INT    AS total_missed,
         SUM(total_cancelled)::INT AS total_cancelled
       FROM token_analytics_daily
       WHERE branch_id = $1
         AND analytics_date BETWEEN $2::date AND $3::date
       GROUP BY analytics_date
       ORDER BY analytics_date ASC`,
      [opts.branchId, opts.from, opts.to],
    );
  }

  /**
   * Wait-time breakdown for a date -- avg and percentile distribution per reference.
   * Reads from token_records directly so it works for today too.
   */
  async getWaitTimes(opts: {
    branchId: string;
    date:     string;
  }): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT
         reference_type,
         reference_id,
         COUNT(*) FILTER (WHERE called_at IS NOT NULL)::INT AS calls_with_wait,
         AVG(
           EXTRACT(EPOCH FROM (called_at - issued_at))
         ) FILTER (WHERE called_at IS NOT NULL)::INT                       AS avg_wait_seconds,
         PERCENTILE_CONT(0.50) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (called_at - issued_at))
         ) FILTER (WHERE called_at IS NOT NULL)::INT                       AS p50_wait_seconds,
         PERCENTILE_CONT(0.90) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (called_at - issued_at))
         ) FILTER (WHERE called_at IS NOT NULL)::INT                       AS p90_wait_seconds,
         PERCENTILE_CONT(0.99) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (called_at - issued_at))
         ) FILTER (WHERE called_at IS NOT NULL)::INT                       AS p99_wait_seconds
       FROM token_records
       WHERE branch_id = $1
         AND issued_at::date = $2::date
       GROUP BY reference_type, reference_id
       ORDER BY reference_id ASC`,
      [opts.branchId, opts.date],
    );
  }

  /**
   * Counter performance for a date -- tokens handled, avg service time, per counter.
   */
  async getCounterPerf(opts: {
    branchId: string;
    date:     string;
  }): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT
         counter_id,
         COUNT(*)::INT                                                              AS total_handled,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::INT                         AS total_completed,
         COUNT(*) FILTER (WHERE status = 'MISSED')::INT                            AS total_missed,
         AVG(
           EXTRACT(EPOCH FROM (completed_at - called_at))
         ) FILTER (WHERE completed_at IS NOT NULL AND called_at IS NOT NULL)::INT  AS avg_serve_seconds,
         MIN(called_at)                                                             AS first_call_at,
         MAX(completed_at)                                                          AS last_complete_at
       FROM token_records
       WHERE branch_id = $1
         AND issued_at::date = $2::date
         AND counter_id IS NOT NULL
       GROUP BY counter_id
       ORDER BY total_handled DESC`,
      [opts.branchId, opts.date],
    );
  }

  /**
   * Export raw token_records for a date range.
   * Returns rows array; controller formats as CSV when format=csv.
   */
  async exportRecords(opts: {
    branchId: string;
    from:     string;
    to:       string;
  }): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT
         id, branch_id, reference_type, reference_id,
         token_number, token_prefix, full_token, token_type, priority, status,
         counter_id, issued_at, called_at, completed_at,
         appointment_id, kiosk_id, created_at
       FROM token_records
       WHERE branch_id = $1
         AND issued_at::date BETWEEN $2::date AND $3::date
       ORDER BY issued_at ASC`,
      [opts.branchId, opts.from, opts.to],
    );
  }

  /**
   * GAP-13: Live analytics for today (reads token_records directly).
   *
   * The nightly cron only populates token_analytics_daily for previous days,
   * so getAnalytics() returns no rows for today. This method queries
   * token_records directly for the current day so dashboards can show
   * real-time numbers without waiting for midnight aggregation.
   */
  async getLiveAnalytics(opts: {
    branchId:      string;
    referenceId?:  string;
    referenceType?: string;
  }): Promise<unknown[]> {
    const today = new Date().toISOString().slice(0, 10);
    const params: unknown[] = [opts.branchId, today];
    let refFilter = '';

    if (opts.referenceType) {
      params.push(opts.referenceType);
      refFilter += ` AND reference_type = $${params.length}`;
    }
    if (opts.referenceId) {
      params.push(opts.referenceId);
      refFilter += ` AND reference_id = $${params.length}`;
    }

    return this.dataSource.query(
      `SELECT
         branch_id,
         reference_type,
         reference_id,
         $2::date                                                             AS analytics_date,
         COUNT(*)                                                             AS total_issued,
         COUNT(*) FILTER (WHERE status IN ('CALLED','SERVING','COMPLETED'))  AS total_called,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')                        AS total_completed,
         COUNT(*) FILTER (WHERE status = 'MISSED')                           AS total_missed,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')                        AS total_cancelled,
         AVG(
           EXTRACT(EPOCH FROM (called_at - issued_at))
         ) FILTER (WHERE called_at IS NOT NULL)::INT                         AS avg_wait_seconds
       FROM token_records
       WHERE branch_id = $1
         AND issued_at::date = $2::date
         ${refFilter}
       GROUP BY branch_id, reference_type, reference_id
       ORDER BY reference_id ASC`,
      params,
    );
  }

}
