import {
  Inject, Injectable, NotFoundException, ConflictException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual, IsNull } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';

import { TokenLocation } from './entities/token-location.entity';
import { TokenCounter }  from './entities/token-counter.entity';
import { TokenCall }     from './entities/token-call.entity';
import { TokenRecord, RecordReferenceType } from './entities/token-record.entity';
import { DisplayPage }   from './entities/display-page.entity';
import { User }          from '../users/entities/user.entity';
import { InjectRedis }   from '../../common/redis/redis.provider';
import { HisTokenBridgeService, HisDepartment, HisServiceCenter } from '../his/token/his-token-bridge.service';
import { TokenSequenceService } from './queue/token-sequence.service';
import { TokenQueueService } from './queue/token-queue.service';
import { DEFAULT_BRANCH_ID, branchFilter } from '../branch/branch.service';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';

// -- Redis key helpers (all location-scoped) --------------------------------

const KEY = {
  session:  (locationId: string, counterNumber: number) =>
    `token:session:${locationId}:${counterNumber}`,
  callLock: (locationId: string, token: number) =>
    `token:lock:${locationId}:${token}`,
  calledSet: (locationId: string) => {
    const d = new Date();
    return `token:called:${locationId}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },
  issuedCount: (locationId: string) => {
    const d = new Date();
    return `token:issued:${locationId}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },
  /** Tokens explicitly marked "did not arrive" by an operator — permanently disabled for the day */
  noShowSet: (locationId: string) => {
    const d = new Date();
    return `token:noshow:${locationId}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },
} as const;

const SESSION_TTL_S  = 60 * 60;
const LOCK_TTL_MS    = 5_000;
const CALLED_SET_TTL = 25 * 3600;

// -- Print receipt line styling defaults -------------------------------------
// Per-line "color intensity" (0-100, applied as opacity/alpha on that line
// of the printed receipt) and a global line-spacing multiplier, both editable
// from Token Settings -> Print Config. Kept as sensible defaults here so
// existing configs saved before these fields existed still render correctly.
export const DEFAULT_LINE_INTENSITY = {
  hospitalName: 100,
  tagline: 100,
  tokenLabel: 60,
  tokenNumber: 100,
  locationLabel: 100,
  divider: 30,
  dateText: 60,
  footerText: 100,
};

// Per-line font size (px) and font family, same additive JSONB pattern as
// DEFAULT_LINE_INTENSITY above -- editable from Token Settings -> Print
// Config -> "Line Spacing & Color" tab.
export const DEFAULT_LINE_FONT_SIZE = {
  hospitalName: 20,
  tagline: 13,
  tokenLabel: 11,
  tokenNumber: 48,
  locationLabel: 14,
  dateText: 12,
  footerText: 12,
};

export const DEFAULT_LINE_FONT_FAMILY = {
  hospitalName: 'inherit',
  tagline: 'inherit',
  tokenLabel: 'inherit',
  tokenNumber: 'inherit',
  locationLabel: 'inherit',
  dateText: 'inherit',
  footerText: 'inherit',
};

// -- Display theme ----------------------------------------------------------

export interface DisplayTheme {
  backgroundColor: string;
  topBar: {
    background: string;
    titleColor: string;
    clockColor: string;
  };
  locationHeader: {
    background: string;
    textColor:  string;
  };
  counterCard: {
    borderColor:      string;
    counterNameColor: string;
    tokenColor:       string;
    tokenGlowEnabled: boolean;
    nowServingColor:  string;
    flashColor:       string;
  };
  recentBar: {
    background:  string;
    borderColor: string;
    labelColor:  string;
    tokenColor:  string;
    metaColor:   string;
  };
}

export const DEFAULT_DISPLAY_THEME: DisplayTheme = {
  backgroundColor: '#08111f',
  topBar: {
    background:  'rgba(255,255,255,0.02)',
    titleColor:  '#ffffff',
    clockColor:  'rgba(255,255,255,0.4)',
  },
  locationHeader: {
    background: 'rgba(255,255,255,0.04)',
    textColor:  '#ffffff',
  },
  counterCard: {
    borderColor:      'rgba(255,255,255,0.08)',
    counterNameColor: '#ffffff',
    tokenColor:       '#FFD700',
    tokenGlowEnabled: true,
    nowServingColor:  'rgba(255,255,255,0.5)',
    flashColor:       'rgba(255,215,0,0.35)',
  },
  recentBar: {
    background:  'rgba(0,0,0,0.4)',
    borderColor: 'rgba(255,255,255,0.08)',
    labelColor:  'rgba(255,255,255,0.4)',
    tokenColor:  '#FFD700',
    metaColor:   'rgba(255,255,255,0.4)',
  },
};

// -- Public interfaces ------------------------------------------------------

export interface CounterSlot {
  id:            string;
  counterNumber: number;
  currentToken:  number | null;
  operatorId:    string | null;
  /** Display name of the operator currently holding the session, if resolvable. Internal/authenticated views only -- never sent on the public display board. */
  operatorName:  string | null;
  isOccupied:    boolean;
}

export interface LocationState {
  id:           string;
  code:         string;
  label:        string;
  isActive:     boolean;
  displayOrder: number;
  counters:     CounterSlot[];
  calledTokens: number[];
  noShowTokens: number[];
  issuedCount:  number;
  /** Globally-unique TV display board token — see TokenLocation.displayToken's doc comment. */
  displayToken: string | null;
  /**
   * HIS-sourced service center ID (TokenLocation.serviceCenterId), null for
   * plain LOCATION-mode locations. TokenKioskAssignment rows for
   * SERVICE_CENTER-type assignments never have their own locationId
   * populated (see that entity's docstring) -- callers matching a kiosk
   * assignment to its location state must match on this field instead of
   * `id` for such assignments, since `id` is always this TokenLocation's own
   * UUID, never the HIS service center ID the assignment actually carries.
   */
  serviceCenterId: string | null;
}

export interface TokenCalledPayload {
  locationId:    string;
  locationCode:  string;
  locationLabel: string;
  counterNumber: number;
  counterId:     string;
  tokenNumber:   number;
  calledBy:      string;
  calledAt:      string;
  branchId:      string | null;
  action?:       'CALLED' | 'RECALLED' | 'MISSED';
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(TokenLocation) private readonly locationRepo:    Repository<TokenLocation>,
    @InjectRepository(TokenCounter)  private readonly counterRepo:     Repository<TokenCounter>,
    @InjectRepository(TokenCall)     private readonly callRepo:        Repository<TokenCall>,
    @InjectRepository(TokenRecord)   private readonly tokenRecordRepo: Repository<TokenRecord>,
    @InjectRepository(DisplayPage)   private readonly displayPageRepo: Repository<DisplayPage>,
    @InjectRepository(User)          private readonly userRepo:        Repository<User>,
    @InjectRedis() private readonly redis: Redis,
    private readonly hisTokenBridge:    HisTokenBridgeService,
    private readonly sequenceService:   TokenSequenceService,
    private readonly tokenQueueService:  TokenQueueService,

    /**
     * Stage B (Checkpoint B3.8) — scoped repository for `getRecentCalls()`
     * only (session-resolved-only, `TokenController.getHistory()`).
     * `getLocations()`/`getLocationState()`/`getAllLocationsState()` all
     * stay raw — each is reached from at least one chain-resolved call
     * site (the public `public/state` route, or `TokenQueueController`'s
     * public `state/:referenceType/:referenceId` route), disqualifying
     * them per the Eligibility Rule.
     */
    @Inject(getTenantScopedRepositoryToken(TokenCall))
    private readonly scopedCallRepo: TenantScopedRepository<TokenCall>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Locations -------------------------------------------------------------

  // A5.5 API Contract Audit: admin GET token/locations & token/locations/all -- explicit select excludes tenantId.
  //
  // Cross-tenant leak fix (2026-07-20, real incident): this query never
  // filtered on tenant_id at all -- two completely separate cloud tenants
  // (mosc, almas) both saw the exact same "General Billing"/"Billing
  // Counter" locations in the authenticated "Join a Billing Counter" panel.
  // Root cause was two-part, same shape as the earlier token_branch_config
  // fix this session: (1) those two rows are literal pre-multi-tenancy seed
  // data (1700000015000-AddTokenLocations.ts) that a later migration
  // (1783810000000-AddTenantIdToTokenTables.ts) backfilled to the single
  // 'default' tenant instead of cloning per-tenant, and (2) this method
  // simply never read tenant_id in its WHERE clause regardless.
  //
  // Only filters when an ambient tenant is actually resolved
  // (`TenantContextStorage`, populated by `TenantContextInterceptor` from
  // the authenticated JWT principal -- see TokenController's class-level
  // interceptor). This method is ALSO reached with no ambient tenant from
  // the public TV-display path (`getPublicState()` -> `getAllLocationsState()`
  // -> here) and the websocket gateway's broadcasts, neither of which
  // establish `TenantContextStorage` per-event today -- that's a separate,
  // not-yet-fixed gap (flagged in CLOUD_VS_SELF_HOSTED_ROADMAP.md), not
  // silently worked around here by, say, defaulting to 'default' and
  // hiding the problem. This fix covers the reported, authenticated-admin
  // symptom completely and safely; it does not regress the already-broken
  // public/gateway paths any further.
  // `explicitTenantId` lets callers with NO ambient JWT/TenantContextStorage
  // context (the public, unauthenticated TV-display/kiosk paths --
  // `getPublicState()`, `getPublicLocationByCode()`) still scope this query
  // correctly, using the subdomain-resolved tenant instead (always
  // available per-request via SubdomainTenantMiddleware's Fastify hook,
  // independent of login state -- see that class's doc comment). When
  // omitted, falls back to ambient `TenantContextStorage` exactly as
  // before, for the authenticated admin "join panel" routes.
  async getLocations(activeOnly = true, branchId?: string | null, explicitTenantId?: string | null): Promise<TokenLocation[]> {
    const qb = this.locationRepo.createQueryBuilder('loc')
      .orderBy('loc.display_order', 'ASC')
      .addOrderBy('loc.created_at', 'ASC')
      .select([
        'loc.id', 'loc.code', 'loc.label', 'loc.isActive', 'loc.displayOrder',
        'loc.createdAt', 'loc.updatedAt', 'loc.branchId', 'loc.intrabranchId',
        'loc.departmentId', 'loc.departmentName', 'loc.serviceCenterId',
        'loc.serviceCenterName', 'loc.tokenPrefix', 'loc.displayToken',
      ]);

    if (activeOnly) {
      qb.andWhere('loc.is_active = true');
    }

    if (branchId) {
      qb.andWhere(`${branchFilter('loc')} = :branchId`, { branchId });
    }

    const tenantId = explicitTenantId ?? await this.tenantContext.currentTenantIdOrNull();
    if (tenantId) {
      qb.andWhere('loc.tenant_id = :tenantId', { tenantId });
    }

    // TEMP DIAGNOSTIC (2026-07-20) -- investigating "both tenants see
    // identical locations" despite the tenant filter above and confirmed-
    // distinct tenant_id values in the DB. Logged at `warn` so it shows up
    // regardless of configured log level. Safe to remove once resolved.
    const result = await qb.getMany();
    this.logger.warn(
      `[locations-resolve] resolvedTenantId=${tenantId ?? '(none)'} rowCount=${result.length} codes=${result.map(r => r.code).join(',')}`,
    );
    return result;
  }

  async createLocation(label: string, branchId?: string | null): Promise<TokenLocation> {
    const code = label
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .slice(0, 60);

    // Cross-tenant leak fix (2026-07-20): both the duplicate-code check and
    // the next-display-order lookup below used to query across ALL
    // tenants' rows (the `code` column's unique constraint was global --
    // see 1785800000000-PerTenantTokenLocations.ts). That meant tenant A
    // creating "General Billing" could false-positive "already exists"
    // against tenant B's row of the same name, and new locations' display
    // order silently continued from other tenants' counts. Resolve tenantId
    // once, up front, and scope both queries by it.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    // TypeORM's FindOptionsWhere rejects a literal `null` for a nullable
    // column -- it wants the IsNull() operator instead (same fix shape as
    // SettingsService.getSettings() earlier this session).
    const tenantWhere = tenantId ?? IsNull();
    const exists = await this.locationRepo.findOne({ where: { code, tenantId: tenantWhere } });
    if (exists) throw new BadRequestException(`A location with name "${label}" already exists`);

    const all = await this.locationRepo.find({ where: { tenantId: tenantWhere }, order: { displayOrder: 'DESC' } });
    const nextOrder = all.length > 0 ? (all[0].displayOrder ?? 0) + 1 : 0;

    return this.locationRepo.save(
      this.locationRepo.create({
        code,
        label,
        displayOrder: nextOrder,
        isActive: true,
        branchId: branchId ?? DEFAULT_BRANCH_ID,
        tenantId,
        displayToken: this.generateDisplayToken(),
      }),
    );
  }

  /** 32 hex chars, globally unique (see uq_token_locations_display_token) -- see TokenLocation.displayToken's doc comment for why this exists. */
  private generateDisplayToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async updateLocation(
    id: string,
    data: { label?: string; displayOrder?: number; tokenPrefix?: string },
  ): Promise<TokenLocation> {
    const loc = await this.locationRepo.findOne({ where: { id } });
    if (!loc) throw new NotFoundException('Location not found');
    await this.locationRepo.update(id, data);
    return this.locationRepo.findOneOrFail({ where: { id } });
  }

  async toggleLocation(id: string): Promise<TokenLocation> {
    const loc = await this.locationRepo.findOne({ where: { id } });
    if (!loc) throw new NotFoundException('Location not found');
    await this.locationRepo.update(id, { isActive: !loc.isActive });
    return this.locationRepo.findOneOrFail({ where: { id } });
  }

  // -- Counter helpers -------------------------------------------------------

  private async getOrCreateCounter(
    locationId: string,
    counterNumber: number,
  ): Promise<TokenCounter> {
    let counter = await this.counterRepo.findOne({ where: { locationId, counterNumber } });
    if (!counter) {
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      counter = await this.counterRepo.save(
        this.counterRepo.create({ locationId, counterNumber, isActive: true, tenantId }),
      );
    }
    return counter;
  }

  // -- State -----------------------------------------------------------------

  async getLocationState(locationId: string): Promise<LocationState> {
    const loc = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!loc) throw new NotFoundException('Location not found');

    // SERVICE_CENTER_BASED branches issue tokens through TokenQueueService
    // into token_records (referenceType='SERVICE_CENTER', referenceId =
    // loc.serviceCenterId, a HIS-sourced ID -- NOT this TokenLocation's own
    // id) instead of through this method's Redis INCR/calledSet mechanism.
    // Falling through to the Redis-only logic below for such a location
    // means issuedCount/calledTokens always read back 0/empty regardless of
    // how many tokens the kiosk actually issued -- the counter grid stays
    // permanently disabled and "Now Serving" stays blank even though the
    // kiosk is printing tokens correctly. See callToken()'s matching branch,
    // required for the same reason on the write side.
    if (loc.serviceCenterId) {
      return this.getServiceCenterLocationState(loc);
    }

    const [counters, calledMembers, issuedStr, noShowMembers] = await Promise.all([
      this.counterRepo.find({
        where: { locationId, isActive: true },
        order: { counterNumber: 'ASC' },
      }),
      this.redis.smembers(KEY.calledSet(locationId)),
      this.redis.get(KEY.issuedCount(locationId)),
      this.redis.smembers(KEY.noShowSet(locationId)),
    ]);

    const calledTokens = calledMembers.map(Number);
    const noShowTokens = noShowMembers.map(Number);
    const issuedCount = parseInt(issuedStr || '0', 10);

    const operatorIds = await Promise.all(
      counters.map((c) => this.redis.get(KEY.session(locationId, c.counterNumber))),
    );

    const uniqueIds = [...new Set(operatorIds.filter((id): id is string => id !== null))];
    const operatorNameById = new Map<string, string>();
    if (uniqueIds.length > 0) {
      const operators = await this.userRepo.find({ where: { id: In(uniqueIds) } });
      for (const u of operators) {
        operatorNameById.set(u.id, u.fullName || u.username);
      }
    }

    const slots: CounterSlot[] = counters.map((c, i) => {
      const operatorId = operatorIds[i];
      return {
        id:            c.id,
        counterNumber: c.counterNumber,
        currentToken:  c.currentToken,
        operatorId,
        operatorName:  operatorId ? (operatorNameById.get(operatorId) ?? null) : null,
        isOccupied:    operatorId !== null,
      };
    });

    return {
      id:           loc.id,
      code:         loc.code,
      label:        loc.label,
      isActive:     loc.isActive,
      displayOrder: loc.displayOrder,
      counters:     slots,
      calledTokens,
      noShowTokens,
      issuedCount,
      serviceCenterId: loc.serviceCenterId ?? null,
      displayToken: loc.displayToken ?? null,
    };
  }

  /**
   * getLocationState()'s equivalent for a SERVICE_CENTER-backed location.
   * issuedCount/calledTokens/noShowTokens are derived from today's
   * token_records rows instead of Redis. counter.currentToken/operator
   * session tracking are left as plain Postgres/Redis lookups exactly like
   * the LOCATION path -- joining a counter and "Now Serving" bookkeeping
   * were never broken here, only the token-issued/called bookkeeping that
   * lived exclusively in Redis was blind to this location's actual token
   * source. Mirrors the same referenceType/referenceId query
   * TokenQueueController's GET /token/queue/state/SERVICE_CENTER/:id uses.
   */
  private async getServiceCenterLocationState(loc: TokenLocation): Promise<LocationState> {
    const referenceType: RecordReferenceType = 'SERVICE_CENTER';
    const referenceId = loc.serviceCenterId!;
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const [counters, todaysRecords] = await Promise.all([
      this.counterRepo.find({
        where: { locationId: loc.id, isActive: true },
        order: { counterNumber: 'ASC' },
      }),
      this.tokenRecordRepo.find({
        where: { referenceType, referenceId, issuedAt: MoreThanOrEqual(todayStart) },
      }),
    ]);

    // Sequential daily numbering (same as the Redis INCR this replaces) --
    // the highest token number issued today IS the issued count.
    const issuedCount = todaysRecords.reduce((max, r) => Math.max(max, r.tokenNumber), 0);
    // Bug fix: MISSED must stay included in calledTokens, matching LOCATION
    // mode's semantics exactly -- LOCATION mode's calledTokens comes from
    // Redis's calledSet, which markNotArrived() never removes a token from,
    // so a not-arrived token still reads as "called" there and the counter
    // grid opens the recall action menu on click. Excluding MISSED here made
    // a marked-not-arrived SC-mode token drop out of calledTokens entirely
    // the moment markServiceCenterTokenNotArrived() set its status --
    // "called" went false client-side, the tile's onClick fell through past
    // the "if (called) open menu" branch straight to handleCall(), which
    // itself immediately no-ops on isNoShow() -- leaving the token
    // unclickable and unrecallable through the UI.
    const calledTokens = todaysRecords
      .filter((r) => ['CALLED', 'SERVING', 'COMPLETED', 'RECALLED', 'MISSED'].includes(r.status))
      .map((r) => r.tokenNumber);
    const noShowTokens = todaysRecords
      .filter((r) => r.status === 'MISSED')
      .map((r) => r.tokenNumber);

    const operatorIds = await Promise.all(
      counters.map((c) => this.redis.get(KEY.session(loc.id, c.counterNumber))),
    );
    const uniqueIds = [...new Set(operatorIds.filter((id): id is string => id !== null))];
    const operatorNameById = new Map<string, string>();
    if (uniqueIds.length > 0) {
      const operators = await this.userRepo.find({ where: { id: In(uniqueIds) } });
      for (const u of operators) operatorNameById.set(u.id, u.fullName || u.username);
    }

    const slots: CounterSlot[] = counters.map((c, i) => {
      const operatorId = operatorIds[i];
      return {
        id:            c.id,
        counterNumber: c.counterNumber,
        currentToken:  c.currentToken,
        operatorId,
        operatorName:  operatorId ? (operatorNameById.get(operatorId) ?? null) : null,
        isOccupied:    operatorId !== null,
      };
    });

    return {
      id:           loc.id,
      code:         loc.code,
      label:        loc.label,
      isActive:     loc.isActive,
      displayOrder: loc.displayOrder,
      counters:     slots,
      calledTokens,
      noShowTokens,
      issuedCount,
      serviceCenterId: loc.serviceCenterId ?? null,
      displayToken: loc.displayToken ?? null,
    };
  }

  async getAllLocationsState(branchId?: string | null, explicitTenantId?: string | null): Promise<LocationState[]> {
    const locations = await this.getLocations(true, branchId, explicitTenantId);
    return Promise.all(locations.map((l) => this.getLocationState(l.id)));
  }

  // Every kiosk, TV display, and registration panel polls GET /token/public/state
  // and reconnects to it on every socket (re)connect -- independently, on its
  // own timer. With N such clients open for a branch, that's N full
  // Redis+Postgres recomputations of every location's state landing within
  // the same second or two, repeatedly. Observed directly: 4+ calls to the
  // same branch's public/state within ~10s, each taking 1.7-5.8s -- sustained
  // load heavy enough to slow down the whole app, not just these screens
  // (shared Postgres/Redis connection pools).
  //
  // Coalesce bursts of calls for the same branch into one real computation,
  // refreshed at most every STATE_CACHE_TTL_MS. Deliberately NOT applied to
  // getAllLocationsState() itself, which broadcastState() calls right after
  // an operator action (call/reset/issue) -- that path must always reflect
  // the change that just happened, not a moment-old cached snapshot.
  // Fix (2026-07-20, real incident -- Token Queue "Join a Billing Counter"
  // cross-tenant leak): this cache was keyed ONLY by branchId. Two distinct
  // real tenants (mosc, almas) both use the synthetic DEFAULT_BRANCH_ID
  // ('2') for their default branch, so they collided on the exact same
  // cache entry -- whichever tenant's request computed the entry first
  // would have its locations served back to the OTHER tenant for up to
  // STATE_CACHE_TTL_MS, entirely independent of the tenant-filter fix in
  // getLocations(). Key must include tenantId too.
  private publicStateCache = new Map<string, { expires: number; promise: Promise<any> }>();
  private static readonly STATE_CACHE_TTL_MS = 1_500;

  // `tenantId` here is the SUBDOMAIN-resolved tenant (see TokenController's
  // route handler), not the ambient TenantContextStorage one -- this is the
  // public, unauthenticated `/token/public/state` route (no JWT principal),
  // which is the actual route the "Join a Billing Counter" panel calls
  // (confirmed via [tenant-interceptor]/[locations-resolve] diagnostic
  // logs, 2026-07-20: principalPresent=false, and resolvedTenantId fell
  // back to whatever the ambient SessionTenantResolver default happened to
  // be -- NOT the requesting tenant).
  async getPublicState(branchId?: string | null, tenantId?: string | null) {
    // Bug fix (2026-07-31, real incident -- Token Queue kiosk showing "1"
    // and "0 waiting" while the counter panel was already at 4/16): this
    // cache key collapsed to the literal string '__default__' whenever
    // `tenantId` was null -- which is exactly what happens on every public/
    // unauthenticated kiosk request when SubdomainTenantMiddleware can't
    // resolve a tenant from the Host header (e.g. accessing the app via
    // plain `localhost:3000` in dev, with no subdomain). Two different real
    // tenants sharing the same branchId (already a known issue -- see the
    // 2026-07-20 MOSC/almas DEFAULT_BRANCH_ID comment on getLocations()
    // above, which fixed the underlying *query* filter) would still collide
    // on this *cache* entry whenever both hit this endpoint with an
    // unresolved tenant: whichever tenant's snapshot got cached first for
    // that branchId was served back to every other tenant/kiosk hitting the
    // same key for the next STATE_CACHE_TTL_MS. A tenant-less response is
    // only ever valid for the single request that produced it -- it must
    // never be reused across other callers. Skip the cache entirely in that
    // case rather than risk serving a stale/foreign snapshot.
    if (!tenantId) {
      return this._computePublicState(branchId, tenantId);
    }

    const cacheKey = `${tenantId}:${branchId ?? '__default__'}`;
    const now = Date.now();
    const cached = this.publicStateCache.get(cacheKey);
    if (cached && cached.expires > now) return cached.promise;

    const promise = this._computePublicState(branchId, tenantId);
    this.publicStateCache.set(cacheKey, { expires: now + TokenService.STATE_CACHE_TTL_MS, promise });
    promise.catch(() => this.publicStateCache.delete(cacheKey)); // don't cache a failure
    return promise;
  }

  private async _computePublicState(branchId?: string | null, tenantId?: string | null) {
    return (async () => {
      const state = await this.getAllLocationsState(branchId, tenantId);
      // serviceCenterId is included deliberately -- callers like the kiosk
      // page match a SERVICE_CENTER-type kiosk assignment to its location
      // state via this field, since TokenKioskAssignment.locationId is never
      // populated for that assignment type (see LocationState's docstring).
      // Without it, matching falls back to comparing the assignment's
      // serviceCenterId against `id` (always this TokenLocation's own UUID),
      // which can never succeed -- the direct cause of "0 people waiting" and
      // "next token" resetting to 1 on every kiosk reload for SC-mode kiosks.
      return state.map(({ id, code, label, isActive, displayOrder, counters, calledTokens, noShowTokens, issuedCount, serviceCenterId }) => ({
        id, code, label, isActive, displayOrder, serviceCenterId,
        counters: counters.map(({ id: cid, counterNumber, currentToken, isOccupied }) => ({
          id: cid, counterNumber, currentToken, isOccupied,
        })),
        calledTokens,
        noShowTokens,
        issuedCount,
      }));
    })();
  }

  /**
   * Get the public state for a single location by its code. Used by
   * per-location kiosk. `code` is no longer globally unique as of
   * 1785800000000-PerTenantTokenLocations.ts (it's now unique only per
   * tenant, via a COALESCE(tenant_id, sentinel) index) -- two different
   * tenants can legitimately have their own location sharing the same code
   * (e.g. both cloning 'GENERAL_BILLING'). Without a tenant filter here,
   * this could resolve to the WRONG tenant's location entirely. Same
   * subdomain-resolved `tenantId` as `getPublicState()`.
   */
  async getPublicLocationByCode(code: string, tenantId?: string | null) {
    const tenantWhere = tenantId ? { tenantId } : {};
    const loc = await this.locationRepo.findOne({ where: { code, isActive: true, ...tenantWhere } });
    if (!loc) return null;
    const state = await this.getLocationState(loc.id);
    const { id, label, isActive, displayOrder, counters, calledTokens, issuedCount, serviceCenterId } = state;
    return {
      id, code, label, isActive, displayOrder, serviceCenterId,
      branchId: loc.branchId ?? null,
      counters: counters.map(({ id: cid, counterNumber, currentToken, isOccupied }) => ({
        id: cid, counterNumber, currentToken, isOccupied,
      })),
      calledTokens,
      issuedCount,
    };
  }

  /**
   * Cloud Token Queue Display fix (2026-07-31, real incident): the public
   * display board's tenant used to be resolved from the request hostname
   * (SubdomainTenantMiddleware), which cloud tenants can't provide (no
   * per-tenant subdomain) -- it always fell back to the 'default' tenant,
   * silently returning zero rows for any real cloud tenant's location
   * `code` (unique only per-tenant). `displayToken` is globally unique
   * (see TokenLocation.displayToken's doc comment), so this deliberately
   * does NOT take or apply a tenant filter -- the token itself already
   * identifies exactly one row, and this method returns that row's own
   * `tenantId` so callers (TokenGateway) can resolve tenant correctly from
   * here on, without depending on hostname resolution at all.
   */
  async getPublicLocationByDisplayToken(displayToken: string) {
    const loc = await this.locationRepo.findOne({ where: { displayToken, isActive: true } });
    if (!loc) return null;
    const state = await this.getLocationState(loc.id);
    const { id, label, isActive, displayOrder, counters, calledTokens, issuedCount, serviceCenterId } = state;
    return {
      id, label, isActive, displayOrder, serviceCenterId,
      code: loc.code,
      tenantId: loc.tenantId ?? null,
      branchId: loc.branchId ?? null,
      counters: counters.map(({ id: cid, counterNumber, currentToken, isOccupied }) => ({
        id: cid, counterNumber, currentToken, isOccupied,
      })),
      calledTokens,
      issuedCount,
    };
  }

  // -- Session management ----------------------------------------------------

  async findExistingSession(
    userId: string,
  ): Promise<{ locationId: string; counterNumber: number } | null> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'token:session:*', 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        const val = await this.redis.get(key);
        if (val === userId) {
          const parts = key.split(':');
          if (parts.length < 4) continue;
          const counterNumber = parseInt(parts[parts.length - 1], 10);
          const locationId    = parts.slice(2, -1).join(':');
          if (!isNaN(counterNumber) && locationId) {
            return { locationId, counterNumber };
          }
        }
      }
    } while (cursor !== '0');
    return null;
  }

  async joinCounter(userId: string, locationId: string, counterNumber: number): Promise<void> {
    const loc = await this.locationRepo.findOne({ where: { id: locationId, isActive: true } });
    if (!loc) throw new NotFoundException('Location not found or inactive');

    const currentOp = await this.redis.get(KEY.session(locationId, counterNumber));
    if (currentOp && currentOp !== userId) {
      throw new ConflictException(`Counter ${counterNumber} is already occupied`);
    }

    await this.releaseAllSessions(userId);
    await this.getOrCreateCounter(locationId, counterNumber);
    await this.redis.setex(KEY.session(locationId, counterNumber), SESSION_TTL_S, userId);
  }

  async leaveCounter(userId: string, locationId: string, counterNumber: number): Promise<void> {
    const current = await this.redis.get(KEY.session(locationId, counterNumber));
    if (current === userId) {
      await this.redis.del(KEY.session(locationId, counterNumber));
    }
  }

  async heartbeat(userId: string, locationId: string, counterNumber: number): Promise<void> {
    const current = await this.redis.get(KEY.session(locationId, counterNumber));
    if (current === userId) {
      await this.redis.expire(KEY.session(locationId, counterNumber), SESSION_TTL_S);
    }
  }

  async releaseAllSessions(userId: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'token:session:*', 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        if ((await this.redis.get(key)) === userId) {
          await this.redis.del(key);
        }
      }
    } while (cursor !== '0');
  }

  // -- Token call ------------------------------------------------------------

  async callToken(
    userId:        string,
    locationId:    string,
    counterNumber: number,
    tokenNumber:   number,
  ): Promise<TokenCalledPayload> {
    // These two don't depend on each other's result -- fetch in parallel
    // rather than paying two sequential round trips before any real work
    // starts (part of the fix for "calling a token takes 4-5 seconds").
    const [location, counter] = await Promise.all([
      this.locationRepo.findOne({ where: { id: locationId, isActive: true } }),
      this.counterRepo.findOne({ where: { locationId, counterNumber } }),
    ]);
    if (!location) throw new NotFoundException('Location not found');
    if (!counter) throw new NotFoundException('Counter not found --- join the counter first');

    // SERVICE_CENTER_BASED locations issue into token_records, not Redis --
    // see getServiceCenterLocationState()'s docstring. Every existing Redis
    // check below (issuedCount, no-show set, called set, call lock) would
    // either always fail (issuedCount permanently 0) or simply never see
    // this location's real tokens at all, so this location's calls must go
    // through token_records directly instead of falling into that logic.
    if (location.serviceCenterId) {
      return this.callServiceCenterToken(userId, location, counter, tokenNumber);
    }

    // Three independent Redis reads -- previously three sequential awaits
    // (three round trips) before the actual call logic even started. None
    // of these depend on each other, so fire them together.
    const [issuedStr, noShow, alreadyCalled] = await Promise.all([
      this.redis.get(KEY.issuedCount(locationId)),
      this.redis.sismember(KEY.noShowSet(locationId), tokenNumber),
      this.redis.sismember(KEY.calledSet(locationId), tokenNumber),
    ]);

    // A token can only be called if it has actually been issued/printed for this location.
    const issuedCount = parseInt(issuedStr || '0', 10);
    if (tokenNumber < 1 || tokenNumber > issuedCount) {
      throw new BadRequestException(
        `Token ${tokenNumber} has not been issued/printed yet in ${location.label} today.`,
      );
    }

    // A token marked not-arrived is still "called" (already in calledSet below),
    // so this branch is mostly unreachable in practice — recallToken() is the
    // normal path back for a not-arrived token. Kept as a defensive guard.
    if (noShow) {
      throw new ConflictException(
        `Token ${tokenNumber} was marked as not-arrived — use Recall to try the patient again.`,
      );
    }

    if (alreadyCalled) {
      throw new ConflictException(
        `Token ${tokenNumber} has already been called in ${location.label} today.`,
      );
    }

    const lockKey  = KEY.callLock(locationId, tokenNumber);
    const acquired = await this.redis.set(lockKey, userId, 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
      throw new ConflictException(
        `Token ${tokenNumber} was just called by another operator.`,
      );
    }

    try {
      const now = new Date();
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      // sadd+expire combined into one pipelined round trip, and run
      // alongside the two independent Postgres writes -- previously four
      // sequential awaits.
      await Promise.all([
        this.redis.pipeline()
          .sadd(KEY.calledSet(locationId), tokenNumber)
          .expire(KEY.calledSet(locationId), CALLED_SET_TTL)
          .exec(),
        this.counterRepo.update(counter.id, { currentToken: tokenNumber }),
        this.callRepo.save(
          this.callRepo.create({
            counterId:   counter.id,
            tokenNumber,
            calledBy:    userId,
            // GAP-3: populate new audit columns
            action:      'CALLED',
            performedBy: userId,
            performedAt: now,
            tenantId,
          }),
        ),
      ]);

      return {
        locationId:    location.id,
        locationCode:  location.code,
        locationLabel: location.label,
        counterNumber,
        counterId:     counter.id,
        tokenNumber,
        calledBy:      userId,
        calledAt:      now.toISOString(),
        branchId:      location.branchId ?? null,
        action:        'CALLED',
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * callToken()'s equivalent for a SERVICE_CENTER-backed location -- looks
   * up the WAITING token_records row (referenceType='SERVICE_CENTER',
   * referenceId=location.serviceCenterId, tokenNumber) instead of validating
   * against Redis's issuedCount (which never gets incremented for these
   * locations), transitions it to CALLED, and returns the same
   * TokenCalledPayload shape callToken() does so the gateway's
   * broadcastTokenCalled()/broadcastState() calls need no changes.
   * counter.currentToken and the token_calls audit row are still written
   * exactly like the LOCATION path -- "Now Serving" and call-history
   * reporting were never the broken part, only issued/called bookkeeping
   * was.
   */
  private async callServiceCenterToken(
    userId:   string,
    location: TokenLocation,
    counter:  TokenCounter,
    tokenNumber: number,
  ): Promise<TokenCalledPayload> {
    const referenceType: RecordReferenceType = 'SERVICE_CENTER';
    const referenceId = location.serviceCenterId!;

    // Bug fix: token numbering resets daily (see token_sequences), so the
    // same referenceType/referenceId/tokenNumber can legitimately match many
    // rows across different days once a service center has been in use more
    // than one day. findOne() with no ordering/date scope could non-
    // deterministically grab a stale prior-day row instead of today's --
    // either throwing a false "already called" (if the stale row wasn't
    // WAITING) or, worse, mutating the WRONG row to CALLED while today's
    // real row stays WAITING forever, which is exactly what made called
    // tokens never turn orange: getServiceCenterLocationState() only reads
    // today's rows, so a token "called" via the wrong row never shows as
    // called there. Scope to today (matching
    // getServiceCenterLocationState()'s own todayStart boundary) and order
    // by issuedAt so the most recent (today's) row always wins.
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const record = await this.tokenRecordRepo.findOne({
      where: { referenceType, referenceId, tokenNumber, issuedAt: MoreThanOrEqual(todayStart) },
      order: { issuedAt: 'DESC' },
    });

    if (!record) {
      throw new BadRequestException(
        `Token ${tokenNumber} has not been issued/printed yet in ${location.label} today.`,
      );
    }
    if (record.status === 'MISSED') {
      throw new ConflictException(
        `Token ${tokenNumber} was marked as not-arrived — use Recall to try the patient again.`,
      );
    }
    if (record.status !== 'WAITING') {
      throw new ConflictException(
        `Token ${tokenNumber} has already been called in ${location.label} today.`,
      );
    }

    const lockKey  = KEY.callLock(location.id, tokenNumber);
    const acquired = await this.redis.set(lockKey, userId, 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) {
      throw new ConflictException(
        `Token ${tokenNumber} was just called by another operator.`,
      );
    }

    try {
      const now = new Date();
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      record.status    = 'CALLED';
      record.counterId = counter.id;
      record.calledBy  = userId;
      record.calledAt  = now;

      // Three independent writes -- previously three sequential awaits.
      await Promise.all([
        this.tokenRecordRepo.save(record),
        this.counterRepo.update(counter.id, { currentToken: tokenNumber }),
        this.callRepo.save(
          this.callRepo.create({
            counterId:   counter.id,
            tokenNumber,
            calledBy:    userId,
            action:      'CALLED',
            performedBy: userId,
            performedAt: now,
            tenantId,
          }),
        ),
      ]);

      return {
        locationId:    location.id,
        locationCode:  location.code,
        locationLabel: location.label,
        counterNumber: counter.counterNumber,
        counterId:     counter.id,
        tokenNumber,
        calledBy:      userId,
        calledAt:      now.toISOString(),
        branchId:      location.branchId ?? null,
        action:        'CALLED',
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async resetCounter(locationId: string, counterNumber: number): Promise<void> {
    const counter = await this.counterRepo.findOne({ where: { locationId, counterNumber } });
    if (counter) await this.counterRepo.update(counter.id, { currentToken: null });
  }

  // -- Token recall (re-announce already-called token) -----------------------

  /**
   * Re-announces a token that was previously called but the patient missed.
   * Unlike callToken(), this bypasses the alreadyCalled Redis check so an
   * already-called token can be announced again. Records action='RECALLED'
   * in token_calls. Does NOT add the token to the called set again (it's
   * already there).
   *
   * Not-arrived tokens are also recallable: recalling one clears its no-show
   * flag and puts it back into the normal "called, waiting" state (frontend
   * shows it in the light-orange color again) so the operator can try the
   * patient again — and mark it not-arrived once more later if needed.
   */
  async recallToken(
    userId:        string,
    locationId:    string,
    counterNumber: number,
    tokenNumber:   number,
  ): Promise<TokenCalledPayload> {
    const location = await this.locationRepo.findOne({ where: { id: locationId, isActive: true } });
    if (!location) throw new NotFoundException('Location not found');

    const counter = await this.counterRepo.findOne({ where: { locationId, counterNumber } });
    if (!counter) throw new NotFoundException('Counter not found --- join the counter first');

    // SERVICE_CENTER-mode locations have no Postgres-side no-show bookkeeping
    // in Redis -- token_records.status is the only real source of truth (see
    // callServiceCenterToken()). Recalling one here without this branch would
    // touch a Redis noShowSet the SC read path never looks at, leaving
    // token_records.status untouched -- the recall would "succeed" (no error)
    // but have no visible effect, since everything the counter grid reads
    // comes from that status column.
    if (location.serviceCenterId) {
      return this.recallServiceCenterToken(userId, location, counter, tokenNumber);
    }

    // If this token was marked not-arrived, recalling it reactivates it —
    // clear the no-show flag rather than blocking the recall.
    const wasNoShow = await this.redis.srem(KEY.noShowSet(locationId), tokenNumber);

    // Update the counter's currently-serving token and record the recall
    await this.counterRepo.update(counter.id, { currentToken: tokenNumber });
    const now = new Date();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    await this.callRepo.save(
      this.callRepo.create({
        counterId:   counter.id,
        tokenNumber,
        calledBy:    userId,
        action:      'RECALLED',
        performedBy: userId,
        performedAt: now,
        notes:       wasNoShow ? 'Recalled after being marked not-arrived' : null,
        tenantId,
      }),
    );

    return {
      locationId:    location.id,
      locationCode:  location.code,
      locationLabel: location.label,
      counterNumber,
      counterId:     counter.id,
      tokenNumber,
      calledBy:      userId,
      calledAt:      now.toISOString(),
      branchId:      location.branchId ?? null,
      action:        'RECALLED',
    };
  }

  /**
   * recallToken()'s equivalent for a SERVICE_CENTER-backed location.
   * Mirrors callServiceCenterToken()'s date-scoped lookup so it always finds
   * today's row, clears a MISSED flag by moving the record back to CALLED
   * (mirroring the LOCATION path's "recall clears not-arrived" behaviour),
   * and re-announces the token via the same token_calls audit trail.
   */
  private async recallServiceCenterToken(
    userId:   string,
    location: TokenLocation,
    counter:  TokenCounter,
    tokenNumber: number,
  ): Promise<TokenCalledPayload> {
    const referenceType: RecordReferenceType = 'SERVICE_CENTER';
    const referenceId = location.serviceCenterId!;
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const record = await this.tokenRecordRepo.findOne({
      where: { referenceType, referenceId, tokenNumber, issuedAt: MoreThanOrEqual(todayStart) },
      order: { issuedAt: 'DESC' },
    });
    if (!record) {
      throw new BadRequestException(
        `Token ${tokenNumber} has not been issued/printed yet in ${location.label} today.`,
      );
    }

    const wasNoShow = record.status === 'MISSED';
    const now = new Date();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    record.status    = 'CALLED';
    record.counterId = counter.id;
    record.calledBy  = userId;
    record.calledAt  = now;

    await Promise.all([
      this.tokenRecordRepo.save(record),
      this.counterRepo.update(counter.id, { currentToken: tokenNumber }),
      this.callRepo.save(
        this.callRepo.create({
          counterId:   counter.id,
          tokenNumber,
          calledBy:    userId,
          action:      'RECALLED',
          performedBy: userId,
          performedAt: now,
          notes:       wasNoShow ? 'Recalled after being marked not-arrived' : null,
          tenantId,
        }),
      ),
    ]);

    return {
      locationId:    location.id,
      locationCode:  location.code,
      locationLabel: location.label,
      counterNumber: counter.counterNumber,
      counterId:     counter.id,
      tokenNumber,
      calledBy:      userId,
      calledAt:      now.toISOString(),
      branchId:      location.branchId ?? null,
      action:        'RECALLED',
    };
  }

  // -- Mark a called token as "did not arrive" --------------------------------

  /**
   * Marks an already-called token as a no-show. This is a status flag, not a
   * dead end: the frontend colors it differently (not the usual light-orange
   * "called, waiting" color) so operators can tell at a glance which called
   * tokens are still waiting vs. confirmed absent, but the token stays fully
   * actionable — recallToken() clears this flag and puts it back into the
   * normal called state, and it can be marked not-arrived again afterwards
   * if the patient still doesn't show up.
   */
  async markNotArrived(
    userId:        string,
    locationId:    string,
    counterNumber: number,
    tokenNumber:   number,
  ): Promise<TokenCalledPayload> {
    const location = await this.locationRepo.findOne({ where: { id: locationId, isActive: true } });
    if (!location) throw new NotFoundException('Location not found');

    const counter = await this.counterRepo.findOne({ where: { locationId, counterNumber } });
    if (!counter) throw new NotFoundException('Counter not found --- join the counter first');

    // SERVICE_CENTER-mode tokens are never added to Redis's calledSet --
    // callServiceCenterToken() only transitions token_records.status. The
    // check below would therefore always read false for a genuinely-called
    // SC token, permanently blocking "Mark not arrived" with a false
    // "has not been called yet" error. Route to the Postgres-status
    // equivalent instead.
    if (location.serviceCenterId) {
      return this.markServiceCenterTokenNotArrived(userId, location, counter, tokenNumber);
    }

    const wasCalled = await this.redis.sismember(KEY.calledSet(locationId), tokenNumber);
    if (!wasCalled) {
      throw new BadRequestException(`Token ${tokenNumber} has not been called yet — nothing to mark.`);
    }

    const alreadyNoShow = await this.redis.sismember(KEY.noShowSet(locationId), tokenNumber);
    if (alreadyNoShow) {
      throw new ConflictException(`Token ${tokenNumber} is already marked as not-arrived.`);
    }

    await this.redis.sadd(KEY.noShowSet(locationId), tokenNumber);
    await this.redis.expire(KEY.noShowSet(locationId), CALLED_SET_TTL);

    const now = new Date();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    await this.callRepo.save(
      this.callRepo.create({
        counterId:   counter.id,
        tokenNumber,
        calledBy:    userId,
        action:      'MISSED',
        performedBy: userId,
        performedAt: now,
        notes:       'Marked not-arrived by operator',
        tenantId,
      }),
    );

    return {
      locationId:    location.id,
      locationCode:  location.code,
      locationLabel: location.label,
      counterNumber,
      counterId:     counter.id,
      tokenNumber,
      calledBy:      userId,
      calledAt:      now.toISOString(),
      branchId:      location.branchId ?? null,
      action:        'MISSED',
    };
  }

  /**
   * markNotArrived()'s equivalent for a SERVICE_CENTER-backed location.
   * Transitions token_records.status CALLED -> MISSED directly instead of
   * touching Redis, mirroring callServiceCenterToken()'s date-scoped lookup
   * so it always targets today's row.
   */
  private async markServiceCenterTokenNotArrived(
    userId:   string,
    location: TokenLocation,
    counter:  TokenCounter,
    tokenNumber: number,
  ): Promise<TokenCalledPayload> {
    const referenceType: RecordReferenceType = 'SERVICE_CENTER';
    const referenceId = location.serviceCenterId!;
    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const record = await this.tokenRecordRepo.findOne({
      where: { referenceType, referenceId, tokenNumber, issuedAt: MoreThanOrEqual(todayStart) },
      order: { issuedAt: 'DESC' },
    });
    if (!record) {
      throw new BadRequestException(
        `Token ${tokenNumber} has not been issued/printed yet in ${location.label} today.`,
      );
    }
    if (record.status === 'MISSED') {
      throw new ConflictException(`Token ${tokenNumber} is already marked as not-arrived.`);
    }
    if (record.status !== 'CALLED' && record.status !== 'RECALLED') {
      throw new BadRequestException(`Token ${tokenNumber} has not been called yet — nothing to mark.`);
    }

    const now = new Date();
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    record.status = 'MISSED';
    await this.tokenRecordRepo.save(record);

    await this.callRepo.save(
      this.callRepo.create({
        counterId:   counter.id,
        tokenNumber,
        calledBy:    userId,
        action:      'MISSED',
        performedBy: userId,
        performedAt: now,
        notes:       'Marked not-arrived by operator',
        tenantId,
      }),
    );

    return {
      locationId:    location.id,
      locationCode:  location.code,
      locationLabel: location.label,
      counterNumber: counter.counterNumber,
      counterId:     counter.id,
      tokenNumber,
      calledBy:      userId,
      calledAt:      now.toISOString(),
      branchId:      location.branchId ?? null,
      action:        'MISSED',
    };
  }

  /**
   * Manual reset for a single location (LOCATION mode):
   * - Zeros the Redis issued-count so the next token is #1
   * - Clears the today called-set so re-called tokens don't collide
   * - Clears currentToken on all counters for this location
   */
  async manualResetLocation(locationId: string): Promise<void> {
    // Reset Redis issued count to 0 (INCR will start from 1 again)
    await this.redis.set(KEY.issuedCount(locationId), '0');
    // Clear today's called set
    await this.redis.del(KEY.calledSet(locationId));
    // Clear current token display on all counters
    await this.counterRepo.update({ locationId }, { currentToken: null });
  }

  /**
   * Manual branch-wide reset (LOCATION mode):
   * Resets all active locations in the branch.
   */
  async manualResetBranch(branchId: string): Promise<void> {
    const locations = await this.locationRepo.find({ where: { branchId, isActive: true } });
    await Promise.all(locations.map((loc) => this.manualResetLocation(loc.id)));
  }

  // A5.5 API Contract Audit: admin GET token/locations/:id/history -- explicit select excludes tenantId.
  async getRecentCalls(locationId: string, limit = 20): Promise<TokenCall[]> {
    const counters = await this.counterRepo.find({ where: { locationId } });
    if (counters.length === 0) return [];
    const ids = counters.map((c) => c.id);
    return (await this.scopedCallRepo
      .createQueryBuilder('call'))
      .where('call.counter_id IN (:...ids)', { ids })
      .orderBy('call.called_at', 'DESC')
      .take(limit)
      .select([
        'call.id', 'call.counterId', 'call.tokenNumber', 'call.calledBy', 'call.calledAt',
        'call.tokenRecordId', 'call.action', 'call.fromCounterId', 'call.toCounterId',
        'call.performedBy', 'call.performedAt', 'call.notes',
      ])
      .getMany();
  }

  // -- Token Print Config ----------------------------------------------------

  async getPrintConfig(): Promise<any> {
    const rows = await this.locationRepo.manager.query(
      `SELECT config FROM token_display_config WHERE id = 'print_global' LIMIT 1`,
    );
    if (!rows?.length || !rows[0].config || Object.keys(rows[0].config).length === 0) {
      return {
        hospitalName: 'ZoeConnect Hospital',
        tagline: 'Care with compassion',
        footerText: 'Please wait for your token to be called.',
        paperSize: '80mm',
        kioskBackgroundUrl: '',
        printBufferTime: 5,
        lineSpacing: 1,
        lineIntensity: DEFAULT_LINE_INTENSITY,
        lineFontSize: DEFAULT_LINE_FONT_SIZE,
        lineFontFamily: DEFAULT_LINE_FONT_FAMILY,
      };
    }
    const cfg = rows[0].config;
    // Back-fill fields added after initial deploy
    if (cfg.printBufferTime === undefined) cfg.printBufferTime = 5;
    if (cfg.lineSpacing === undefined) cfg.lineSpacing = 1;
    if (cfg.lineIntensity === undefined) cfg.lineIntensity = DEFAULT_LINE_INTENSITY;
    if (cfg.lineFontSize === undefined) cfg.lineFontSize = DEFAULT_LINE_FONT_SIZE;
    if (cfg.lineFontFamily === undefined) cfg.lineFontFamily = DEFAULT_LINE_FONT_FAMILY;
    return cfg;
  }

  async savePrintConfig(config: any, updatedBy?: string): Promise<any> {
    await this.locationRepo.manager.query(
      `INSERT INTO token_display_config (id, config, updated_at, updated_by)
       VALUES ('print_global', $1::jsonb, NOW(), $2)
       ON CONFLICT (id) DO UPDATE
         SET config     = EXCLUDED.config,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(config), updatedBy ?? null],
    );
    return config;
  }

  // -- Display Config (TV board theme) ---------------------------------------

  async getDisplayConfig(): Promise<DisplayTheme> {
    const rows = await this.locationRepo.manager.query(
      `SELECT config FROM token_display_config WHERE id = 'display_global' LIMIT 1`,
    );
    if (!rows?.length || !rows[0].config || Object.keys(rows[0].config).length === 0) {
      return DEFAULT_DISPLAY_THEME;
    }
    return rows[0].config as DisplayTheme;
  }

  async saveDisplayConfig(config: DisplayTheme, updatedBy?: string): Promise<DisplayTheme> {
    await this.locationRepo.manager.query(
      `INSERT INTO token_display_config (id, config, updated_at, updated_by)
       VALUES ('display_global', $1::jsonb, NOW(), $2)
       ON CONFLICT (id) DO UPDATE
         SET config     = EXCLUDED.config,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(config), updatedBy ?? null],
    );
    return config;
  }

  // -- Token Issue (Kiosk) ---------------------------------------------------

  async getNextTokenToIssue(locationId: string): Promise<number> {
    const issuedStr = await this.redis.get(KEY.issuedCount(locationId));
    return parseInt(issuedStr || '0', 10) + 1;
  }

  async issueToken(
    locationId: string,
    extra?: {
      departmentId?:    string | null;
      departmentName?:  string | null;
      serviceCenterId?: string | null;
      serviceCenterName?: string | null;
      intrabranchId?:   string | null;
    },
  ): Promise<{ tokenNumber: number; branchId: string | null; fullToken: string; tokenPrefix: string }> {
    const loc = await this.locationRepo.findOne({ where: { id: locationId, isActive: true } });
    if (!loc) throw new NotFoundException('Location not found');

    const branchId = loc.branchId ?? DEFAULT_BRANCH_ID;

    // Requirement: a SERVICE_CENTER-linked location must issue through the
    // SAME TokenQueueService/TokenSequenceService flow the kiosk uses --
    // never the Redis-INCR path below. This manual/staff-issue endpoint
    // (GAP-19) used to always use the Redis counter regardless of mode; two
    // independent counters both feeding token_records for the same
    // referenceId (this endpoint's old Redis counter vs. the kiosk's
    // token_sequences counter) is exactly what let CEO OFFICE hand out a
    // duplicate "002" token after its kiosk assignment was switched to
    // SERVICE_CENTER mode. Every issuance path for an SC-linked queue must
    // share the one real counter.
    if (loc.serviceCenterId) {
      const { record } = await this.tokenQueueService.issueToken({
        branchId,
        referenceType: 'SERVICE_CENTER',
        referenceId:   loc.serviceCenterId,
        tokenType:     'WALK_IN',
      });

      const now = new Date();
      this.hisTokenBridge.insertPrintRecord({
        tokenNumber:       record.tokenNumber,
        locationId:        loc.id,
        locationCode:      loc.code,
        locationName:      loc.label,
        printedAt:         now,
        departmentId:      extra?.departmentId    ?? loc.departmentId    ?? null,
        departmentName:    extra?.departmentName  ?? loc.departmentName  ?? null,
        serviceCenterId:   extra?.serviceCenterId ?? loc.serviceCenterId ?? null,
        serviceCenterName: extra?.serviceCenterName ?? loc.serviceCenterName ?? null,
        intrabranchId:     extra?.intrabranchId   ?? loc.intrabranchId  ?? null,
      }).catch(() => { /* already logged inside bridge */ });

      return {
        tokenNumber: record.tokenNumber,
        branchId:    record.branchId,
        fullToken:   record.fullToken,
        tokenPrefix: record.tokenPrefix,
      };
    }

    const key = KEY.issuedCount(locationId);
    const newCount = await this.redis.incr(key);
    if (newCount === 1) {
      await this.redis.expire(key, CALLED_SET_TTL);
    }

    // GAP-1 fix: persist a TokenRecord with the SAME tokenNumber returned by Redis INCR
    // so that the record and the displayed number always match.
    // Wrapped in try/catch -- a DB write failure must not block token issuance.
    const referenceType = 'LOCATION' as const;
    const referenceId   = loc.id;
    // No zero-padding: token 4 displays/prints as "4" (or "GEN-4"), not "004".
    // (Previously padStart(3, '0') here -- removed 2026-07-25, see the
    // matching change in token-sequence.service.ts's getNextToken().)

    // GAP-4: resolve prefix from token_locations (or token_sc_configs for SC mode).
    // resolvePrefix is safe to call here -- failures fall back to '' silently.
    let tokenPrefix = '';
    try {
      tokenPrefix = await this.sequenceService.resolvePrefix(branchId, referenceType, referenceId);
    } catch {
      // prefix resolution failure must not block issuance
    }
    const fullToken = tokenPrefix ? `${tokenPrefix}-${newCount}` : String(newCount);

    try {
      await this.tokenRecordRepo.save(
        this.tokenRecordRepo.create({
          branchId,
          referenceType,
          referenceId,
          tokenNumber:  newCount,
          tokenPrefix,
          fullToken,
          tokenType:    'WALK_IN',
          priority:     100,
          status:       'WAITING',
          kioskId:      null,
          issuedAt:     new Date(),
        }),
      );
    } catch (err: unknown) {
      this.logger.warn(
        `TokenRecord persist failed for location=${locationId} token=${newCount}: ${(err as Error).message}`,
      );
    }

    // Fire-and-forget insert into HIS PRINT_DATA_DETAIL table
    const now = new Date();
    this.hisTokenBridge.insertPrintRecord({
      tokenNumber:       newCount,
      locationId:        loc.id,
      locationCode:      loc.code,
      locationName:      loc.label,
      printedAt:         now,
      departmentId:      extra?.departmentId    ?? loc.departmentId    ?? null,
      departmentName:    extra?.departmentName  ?? loc.departmentName  ?? null,
      serviceCenterId:   extra?.serviceCenterId ?? loc.serviceCenterId ?? null,
      serviceCenterName: extra?.serviceCenterName ?? loc.serviceCenterName ?? null,
      intrabranchId:     extra?.intrabranchId   ?? loc.intrabranchId  ?? null,
    }).catch(() => { /* already logged inside bridge */ });

    return { tokenNumber: newCount, branchId: loc.branchId ?? null, fullToken, tokenPrefix };
  }

  // -- HIS lookups (dept / service center) -----------------------------------

  async getDepartmentsFromHis(intrabranchId: string): Promise<HisDepartment[]> {
    return this.hisTokenBridge.getDepartments(intrabranchId);
  }

  async getServiceCentersFromHis(
    intrabranchId: string,
    departmentId?: string | null,
  ): Promise<HisServiceCenter[]> {
    return this.hisTokenBridge.getServiceCenters(intrabranchId, departmentId);
  }

  async getHisDepartmentById(departmentId: string): Promise<HisDepartment | null> {
    return this.hisTokenBridge.getDepartmentById(departmentId);
  }

  async getHisServiceCenterById(serviceCenterId: string): Promise<HisServiceCenter | null> {
    return this.hisTokenBridge.getServiceCenterById(serviceCenterId);
  }

  /**
   * Find or create a TokenLocation that corresponds to a HIS service center.
   * Uses code = "SC_{serviceCenterId}" as a stable, collision-free key.
   */
  async ensureLocationForServiceCenter(opts: {
    serviceCenterId:   string;
    serviceCenterName: string;
    departmentId:      string;
    departmentName:    string;
    intrabranchId:     string;
    branchId?:         string | null;
  }): Promise<TokenLocation> {
    const code = `SC_${opts.serviceCenterId}`;

    let loc = await this.locationRepo.findOne({ where: { code } });
    if (!loc) {
      const all = await this.locationRepo.find({ order: { displayOrder: 'DESC' } });
      const nextOrder = all.length > 0 ? (all[0].displayOrder ?? 0) + 1 : 0;
      const tenantId = await this.tenantContext.currentTenantIdOrNull();
      loc = await this.locationRepo.save(
        this.locationRepo.create({
          code,
          label:             opts.serviceCenterName,
          isActive:          true,
          displayOrder:      nextOrder,
          branchId:          opts.branchId ?? opts.intrabranchId,
          intrabranchId:     opts.intrabranchId,
          departmentId:      opts.departmentId,
          departmentName:    opts.departmentName,
          serviceCenterId:   opts.serviceCenterId,
          serviceCenterName: opts.serviceCenterName,
          tenantId,
        }),
      );
    } else {
      const needsUpdate =
        loc.label             !== opts.serviceCenterName ||
        loc.departmentName    !== opts.departmentName    ||
        loc.intrabranchId     !== opts.intrabranchId;

      if (needsUpdate) {
        await this.locationRepo.update(loc.id, {
          label:             opts.serviceCenterName,
          departmentId:      opts.departmentId,
          departmentName:    opts.departmentName,
          intrabranchId:     opts.intrabranchId,
          serviceCenterId:   opts.serviceCenterId,
          serviceCenterName: opts.serviceCenterName,
        });
        loc = await this.locationRepo.findOneOrFail({ where: { id: loc.id } });
      }
    }
    // A5.5 API Contract Audit: reached from @Public() POST
    // token/service-center/ensure (anonymous kiosk find-or-create) which
    // returns this value directly to the client -- strip tenantId before
    // returning. Internal callers (TokenKioskService.migrateAssignment) only
    // read `.id`/`.branchId`/`.serviceCenterId` off the result, unaffected.
    delete (loc as { tenantId?: string | null }).tenantId;
    return loc;
  }
}
