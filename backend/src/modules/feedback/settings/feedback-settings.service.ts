import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { FeedbackSettings } from '../entities/feedback-settings.entity';
import { UpdateFeedbackSettingsDto } from '../dto/feedback-settings.dto';
import { FeedbackAuditService } from '../audit/feedback-audit.service';

const GLOBAL_CACHE_KEY = '__global__';

/**
 * Every other read-heavy path in this module (submission validation on
 * every public submit, resolve() on every page load) would otherwise hit
 * `feedback_settings` on every request for values that change rarely --
 * this is the one settings service in ZoeConnect that actually caches (neither
 * `SettingsService` nor `CmsSettingsService` do, see module memory's
 * research note; both re-read the row on every call). In-memory `Map`,
 * process-local: correct for a single backend instance, and even with
 * multiple instances behind a load balancer the worst case is a stale
 * cache on other instances for up to `CACHE_TTL_MS` after an edit --
 * acceptable for admin-tunable *parameters*, not something that needs
 * distributed cache invalidation (Redis pub/sub, etc.) for a first pass.
 *
 * Keyed by branchId (falling back to the global row) so a future
 * branch-specific settings row -- not written by anything today, see
 * FeedbackSettings' doc comment -- slots in without a cache redesign.
 *
 * Deliberately does NOT special-case "no branch"/standalone (non-HIS-
 * integrated) deployments. `@ActiveBranchId()` always resolves to a real
 * string -- `DEFAULT_BRANCH_ID` ('2', ALMAS) when nothing else applies, see
 * `branch.service.ts` -- so `branchId` here is realistically never actually
 * null/undefined from a real request. Since `update()` never writes a
 * branch-specific row (see its own doc comment), `_loadFromDb` finds no
 * matching branch row for *any* branchId today and always falls through to
 * the single global row -- meaning every branch, HIS-integrated or fully
 * standalone, already reads the same shared configuration with zero special
 * handling required. This only changes once something actually starts
 * writing a branch-specific row.
 */
@Injectable()
export class FeedbackSettingsService {
  private readonly logger = new Logger(FeedbackSettingsService.name);
  private readonly cache = new Map<string, { value: FeedbackSettings; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes -- long enough to matter, short enough that a stale read self-heals quickly without needing cross-instance invalidation

  constructor(
    @InjectRepository(FeedbackSettings)
    private readonly settingsRepo: Repository<FeedbackSettings>,
    private readonly auditService: FeedbackAuditService,
  ) {}

  /**
   * Resolves settings for `branchId` (or the global row if `branchId` is
   * omitted / no branch-specific row exists yet). Cache-first; a miss or
   * expiry falls through to `_loadFromDb`, which also defensively creates
   * the global row if the seed migration was somehow skipped -- same
   * belt-and-suspenders as CmsSettingsService.get().
   */
  async get(branchId?: string | null): Promise<FeedbackSettings> {
    const cacheKey = branchId ?? GLOBAL_CACHE_KEY;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const settings = await this._loadFromDb(branchId);
    this.cache.set(cacheKey, { value: settings, expiresAt: Date.now() + FeedbackSettingsService.CACHE_TTL_MS });
    return settings;
  }

  /**
   * Explicit column list, deliberately excluding `tenantId` (Phase 1
   * scaffolding, not yet consumed anywhere -- see entity doc comment).
   * `get()`/`update()` return this entity directly to the controller with
   * no DTO/serializer in between, so an unfiltered `findOne()` would leak
   * `tenantId` into the API response -- which then breaks the PATCH
   * endpoint's strict-whitelist DTO on any client that round-trips the
   * full object back (found live: the admin settings form does exactly
   * this). Keep this list in sync with FeedbackSettings' real columns,
   * minus `tenantId`, until Task 1.6/1.7 makes tenant scoping load-bearing
   * and this gets revisited properly (e.g. a response DTO).
   */
  private static readonly SELECT_COLUMNS = [
    'id', 'branchId', 'maxSubmissionsPerDevice', 'submissionLimitWindowHours',
    'duplicateSubmissionWindowSeconds', 'defaultGoogleReviewThreshold',
    'defaultGoogleReviewThankYouMessage', 'defaultGoogleReviewInvitationMessage',
    'defaultThankYouMessage', 'defaultSplashDurationSeconds', 'minSplashDurationSeconds',
    'maxSplashDurationSeconds', 'complaintCategories', 'complaintResolvedWhatsappTemplate',
    'updatedAt',
  ] as const;

  private async _loadFromDb(branchId?: string | null): Promise<FeedbackSettings> {
    if (branchId) {
      const branchRow = await this.settingsRepo.findOne({
        where: { branchId },
        select: [...FeedbackSettingsService.SELECT_COLUMNS],
      });
      if (branchRow) return branchRow;
    }
    const globalRow = await this.settingsRepo.findOne({
      where: { branchId: IsNull() },
      select: [...FeedbackSettingsService.SELECT_COLUMNS],
    });
    if (globalRow) return globalRow;

    // Defensive: the migration seeds this row, so this should never actually run outside a fresh/misconfigured DB.
    this.logger.warn('No global feedback_settings row found -- creating one with defaults. This should only happen once.');
    return this.settingsRepo.save(this.settingsRepo.create({ complaintCategories: ['Cleanliness', 'Staff Behavior', 'Waiting Time', 'Billing', 'Medical Care', 'Facilities', 'Communication', 'Other'] }));
  }

  /**
   * Always updates the global row today (branch-specific writes aren't
   * exposed yet -- see class doc comment) -- this is exactly what keeps
   * standalone/non-HIS branches working with zero extra code: there's
   * only ever one settings row to find, so every branch (real or the
   * `DEFAULT_BRANCH_ID` sentinel) reads it.
   *
   * Clears the *entire* cache, not just one key -- deliberate, not an
   * oversight. Because `_loadFromDb` currently has no way to return
   * anything other than the global row, every cache entry (keyed by
   * whatever branchId happened to be requested -- `'2'`, some other real
   * branch id, `__global__`, ...) is really just a duplicate copy of that
   * same global row. Invalidating only `saved.branchId ?? GLOBAL_CACHE_KEY`
   * left every *other* key's copy stale for up to `CACHE_TTL_MS` after a
   * save (caught live: the public submission cap kept enforcing an old
   * limit right after an admin raised it in Settings, because the public
   * portal's cache entry was keyed by the QR's real branch id, not
   * `__global__`). The cache is tiny (one entry per branch actually seen),
   * so clearing all of it on every save is cheap. Revisit this once a
   * real branch-specific row can be written -- at that point only that
   * branch's key (and `__global__` if it was the global row that changed)
   * should be cleared.
   */
  async update(patch: UpdateFeedbackSettingsDto, updatedBy: string): Promise<FeedbackSettings> {
    const current = await this._loadFromDb(null);
    Object.assign(current, patch);
    const saved = await this.settingsRepo.save(current);

    this.cache.clear();

    await this.auditService.log({
      entityType: 'feedback_settings', entityId: saved.id, action: 'UPDATE',
      changedBy: updatedBy, branchId: saved.branchId, summary: 'Updated module-wide feedback settings',
    });
    return saved;
  }
}
