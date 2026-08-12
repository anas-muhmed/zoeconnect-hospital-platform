import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

import { TokenBranchConfig } from '../entities/token-branch-config.entity';
import { TokenCounter }      from '../entities/token-counter.entity';
import { InjectRedis }       from '../../../common/redis/redis.provider';
import { TokenGateway }      from '../token.gateway';

/**
 * TokenDailyResetService — GAP-5
 *
 * Runs every minute and checks each branch's configured dailyResetTime in its
 * own timezone.  When the current minute matches, it performs:
 *
 *   1. Set all today's WAITING / CALLED token_records → MISSED
 *   2. Clear current_token on all counters for the branch
 *   3. Flush Redis sequence keys (token:issued:*) for the branch's locations
 *   4. Broadcast a `token:daily-reset` WebSocket event to the branch room
 *
 * Uses vanilla Intl.DateTimeFormat for timezone-aware time — no external deps.
 */
@Injectable()
export class TokenDailyResetService {
  private readonly logger = new Logger(TokenDailyResetService.name);

  /** Tracks which branches have already been reset this minute to prevent duplicate fires */
  private readonly resetLog = new Map<string, string>(); // branchId → 'YYYY-MM-DD HH:MM'

  constructor(
    @InjectRepository(TokenBranchConfig)
    private readonly configRepo: Repository<TokenBranchConfig>,

    @InjectRepository(TokenCounter)
    private readonly counterRepo: Repository<TokenCounter>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRedis()
    private readonly redis: Redis,

    private readonly gateway: TokenGateway,
  ) {}

  @Cron('* * * * *', { name: 'token-daily-reset' })
  async handleDailyReset(): Promise<void> {
    let configs: TokenBranchConfig[];
    try {
      configs = await this.configRepo.find();
    } catch (err) {
      this.logger.error('Failed to load branch configs for daily reset', err);
      return;
    }

    for (const config of configs) {
      try {
        await this.checkAndResetBranch(config);
      } catch (err) {
        this.logger.error(`Daily reset failed for branch=${config.branchId}`, err);
      }
    }
  }

  // ── Core reset logic ────────────────────────────────────────────────────────

  private async checkAndResetBranch(config: TokenBranchConfig): Promise<void> {
    const nowInTz = this.getNowInTimezone(config.timezone);
    const [resetH, resetM] = (config.dailyResetTime ?? '00:00:00').split(':').map(Number);

    if (nowInTz.hour !== resetH || nowInTz.minute !== resetM) return;

    // Idempotency key: only reset once per branch per minute
    const minuteKey = `${nowInTz.date} ${String(resetH).padStart(2,'0')}:${String(resetM).padStart(2,'0')}`;
    if (this.resetLog.get(config.branchId) === minuteKey) return;
    this.resetLog.set(config.branchId, minuteKey);

    this.logger.log(`Daily reset firing for branch=${config.branchId} at ${minuteKey} (${config.timezone})`);
    await this.resetBranch(config.branchId);
  }

  async resetBranch(branchId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Set WAITING / CALLED token_records → MISSED for today
    await this.dataSource.query(
      `UPDATE token_records
          SET status = 'MISSED'
        WHERE branch_id = $1
          AND issued_at::date = $2::date
          AND status IN ('WAITING', 'CALLED')`,
      [branchId, today],
    );

    // 2. Clear current_token on all branch counters
    //    token_counters.location_id -> token_locations.branch_id
    await this.dataSource.query(
      `UPDATE token_counters tc
          SET current_token = NULL
         FROM token_locations tl
        WHERE tc.location_id = tl.id
          AND tl.branch_id = $1`,
      [branchId],
    );

    // 3. Flush Redis issued-count keys for this branch's locations
    //    Key pattern: token:issued:{locationId}:{YYYY-M-D}
    await this.flushBranchRedisKeys(branchId);

    // 4. Broadcast reset event to all branch clients
    try {
      await this.gateway.broadcastState(branchId);
      this.gateway.broadcastReset(branchId);
    } catch (err) {
      this.logger.warn(`Reset broadcast failed for branch=${branchId}: ${(err as Error).message}`);
    }

    this.logger.log(`Daily reset complete for branch=${branchId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Returns { hour, minute, date } in the given IANA timezone using the
   * built-in Intl API — no external dependency required.
   */
  private getNowInTimezone(timezone: string): { hour: number; minute: number; date: string } {
    const now  = new Date();
    const safe = this.safeTimezone(timezone);

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:    safe,
      hour:        '2-digit',
      minute:      '2-digit',
      year:        'numeric',
      month:       '2-digit',
      day:         '2-digit',
      hour12:      false,
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

    return {
      hour:   parseInt(get('hour'),   10) % 24, // '24' means midnight in some locales
      minute: parseInt(get('minute'), 10),
      date:   `${get('year')}-${get('month')}-${get('day')}`,
    };
  }

  private safeTimezone(tz: string): string {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      this.logger.warn(`Invalid timezone "${tz}", falling back to UTC`);
      return 'UTC';
    }
  }

  private async flushBranchRedisKeys(branchId: string): Promise<void> {
    // Locations for this branch — get their IDs to build Redis key patterns
    const locations: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM token_locations WHERE branch_id = $1`,
      [branchId],
    );

    for (const loc of locations) {
      // Delete all token:issued:{locationId}:* keys
      let cursor = '0';
      do {
        const [next, keys]: [string, string[]] = await this.redis.scan(
          cursor,
          'MATCH',
          `token:issued:${loc.id}:*`,
          'COUNT',
          50,
        );
        cursor = next;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (cursor !== '0');
    }
  }
}
