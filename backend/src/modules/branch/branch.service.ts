import { Inject, Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectRedis } from '../../common/redis/redis.provider';
import { IOracleTransport } from '../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../platform/infrastructure/tokens';

/**
 * Branch ID used when a record has no explicit branch — Oracle orgstructure id=2 (ALMAS)
 *
 * TODO: legacy fallback, see organization-branch module
 * (ZoeConnect Identity Architecture Migration, Phase 1). This sentinel is
 * deeply load-bearing across auth.service.ts, token.service.ts, and
 * token.gateway.ts, all of which must agree on the exact same value for
 * cloud (Oracle-less) tenants today -- see those files' own DEFAULT_BRANCH_ID
 * comments and auth.service.spec.ts's two tests that assert this exact
 * fallback behavior. NOT redirected to OrganizationBranchService.getDefault()
 * in this phase: every call site audited was judged too tightly coupled to
 * this literal-'2' equality to change safely without a dedicated follow-up
 * task (see this phase's audit notes for the full site-by-site breakdown).
 */
export const DEFAULT_BRANCH_ID = '2';

export interface Branch {
  id: string;   // Oracle orgstructure.id stored as string
  name: string;
}

const BRANCH_CACHE_KEY = 'hdsp:branches:all';

/**
 * SQL expression that treats NULL branch_id as the default branch.
 * Use in WHERE clauses: COALESCE(t.branch_id, '2') = :branchId
 */
export function branchFilter(alias: string): string {
  return `COALESCE(${alias}.branch_id, '${DEFAULT_BRANCH_ID}')`;
}
const BRANCH_CACHE_TTL = 1800; // 30 minutes

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRedis()      private readonly redis: Redis,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly config: ConfigService,
  ) {}

  // ── Fetch all branches from Oracle (with Redis cache) ─────────────────────
  async findAll(): Promise<Branch[]> {
    // Try cache first
    const cached = await this.redis.get(BRANCH_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached) as Branch[]; } catch { /* fall through */ }
    }

    if (!this.oracle.isAvailable) {
      // If Oracle is down, try to return from a longer-lived cache
      this.logger.warn('Oracle unavailable — attempting stale branch cache');
      const stale = await this.redis.get(`${BRANCH_CACHE_KEY}:stale`);
      if (stale) {
        try { return JSON.parse(stale) as Branch[]; } catch { /* fall through */ }
      }
      // No cache at all (e.g. fresh deployment, Redis flushed, or Oracle has
      // never come up yet). Previously threw HisUnavailableError here, which
      // surfaced as a 500 on every caller of GET /api/v1/branches —
      // including basic admin flows like the create-user branch picker,
      // which have no real dependency on live Oracle in a single-branch
      // ZoeConnect deployment (everything already falls back to DEFAULT_BRANCH_ID
      // elsewhere — see auth.service.ts's two SUPER_ADMIN fallbacks and
      // branchFilter()'s COALESCE(branch_id, '2') above). Match that same
      // fallback here instead of hard-failing: return just the default
      // branch so branch-dependent UI keeps working. Once Oracle reconnects
      // and this method runs again, the real branch list populates the
      // cache and callers see it on the very next call — no restart needed.
      this.logger.warn(
        `Oracle unavailable and no branch cache present — falling back to DEFAULT_BRANCH_ID ('${DEFAULT_BRANCH_ID}') only`,
      );
      return [{ id: DEFAULT_BRANCH_ID, name: 'Default Branch' }];
    }

    const rows = await this.oracle.query<{ ID: number | string; NAME: string }>(
      `SELECT id, name FROM orgstructure WHERE isactive = 1 ORDER BY name`,
    );

    const branches: Branch[] = rows.map((r) => ({
      id:   String(r.ID),
      name: r.NAME,
    }));

    // Write to cache + stale fallback
    await this.redis.set(BRANCH_CACHE_KEY, JSON.stringify(branches), 'EX', BRANCH_CACHE_TTL);
    await this.redis.set(`${BRANCH_CACHE_KEY}:stale`, JSON.stringify(branches), 'EX', 86400);

    return branches;
  }

  // ── Get a single branch by ID ─────────────────────────────────────────────
  async findOne(branchId: string): Promise<Branch> {
    const all = await this.findAll();
    const branch = all.find((b) => b.id === branchId);
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);
    return branch;
  }

  // ── Get branches assigned to a user ──────────────────────────────────────
  async getUserBranches(userId: string): Promise<Branch[]> {
    const rows = await this.dataSource.query<{ branch_id: string }[]>(
      `SELECT branch_id FROM user_branches WHERE user_id = $1 ORDER BY branch_id`,
      [userId],
    );

    if (!rows.length) return [];

    const assignedIds = new Set(rows.map((r) => r.branch_id));

    // Fetch names — best effort (may be cached)
    let allBranches: Branch[] = [];
    try {
      allBranches = await this.findAll();
    } catch {
      // Oracle unavailable — return IDs without names
      return [...assignedIds].map((id) => ({ id, name: id }));
    }

    return allBranches.filter((b) => assignedIds.has(b.id));
  }

  // ── Assign branches to a user (replaces existing assignment) ─────────────
  async assignBranches(userId: string, branchIds: string[], actorId: string): Promise<Branch[]> {
    // Validate that all given branchIds exist
    if (branchIds.length > 0) {
      let allBranches: Branch[] = [];
      try {
        allBranches = await this.findAll();
      } catch {
        // Oracle down — skip validation but still persist
        this.logger.warn('Could not validate branch IDs — Oracle unavailable');
      }

      if (allBranches.length > 0) {
        const validIds = new Set(allBranches.map((b) => b.id));
        const invalid = branchIds.filter((id) => !validIds.has(id));
        if (invalid.length) {
          throw new NotFoundException(`Unknown branch ID(s): ${invalid.join(', ')}`);
        }
      }
    }

    // Replace in a transaction
    await this.dataSource.transaction(async (em) => {
      await em.query(`DELETE FROM user_branches WHERE user_id = $1`, [userId]);
      for (const branchId of branchIds) {
        await em.query(
          `INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, branchId],
        );
      }
    });

    this.logger.log(`Branches assigned to user ${userId} by ${actorId}: [${branchIds.join(', ')}]`);
    return this.getUserBranches(userId);
  }

  // ── Validate that a user has access to a specific branch ─────────────────
  async validateUserBranch(userId: string, branchId: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ branch_id: string }[]>(
      `SELECT branch_id FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
      [userId, branchId],
    );
    return rows.length > 0;
  }

  // ── Invalidate branch cache (call after orgstructure changes) ────────────
  async invalidateCache(): Promise<void> {
    await this.redis.del(BRANCH_CACHE_KEY);
    this.logger.log('Branch cache invalidated');
  }
}
