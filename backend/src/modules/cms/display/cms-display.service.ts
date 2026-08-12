import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSDisplayAssignment, CmsCacheStatus } from '../entities/cms-display-assignment.entity';
import { CMSDisplayGroup } from '../entities/cms-display-group.entity';
import { CmsPlaylistService } from '../playlist/cms-playlist.service';
import { CmsScheduleService } from '../schedule/cms-schedule.service';
import { CmsAuditService } from '../audit/cms-audit.service';
import { CmsEmergencyService } from '../emergency/cms-emergency.service';
import { CmsPlayerLogService } from '../logs/cms-player-log.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface HealthReport {
  isPlayerOnline?: boolean;
  currentPlaylistId?: string | null;
  currentItemLabel?: string | null;
  currentVersionNumber?: number | null;
  lastSyncAt?: string | null;
  cacheStatus?: CmsCacheStatus | null;
  lastError?: string | null;
  storageUsageBytes?: number | null;
  logs?: { category: string; message: string; occurredAt: string }[];
}

export interface UpdateAssignmentData {
  name?: string;
  playlistId?: string | null;
  isActive?: boolean;
  groupId?: string | null;
  tags?: string[];
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  tickerEnabled?: boolean;
  tickerPosition?: 'top' | 'bottom';
  tickerSpeed?: number;
  tickerBackgroundColor?: string | null;
  tickerTextColor?: string | null;
  tickerFontSize?: number;
  tickerSeparator?: string;
}

@Injectable()
export class CmsDisplayService {
  constructor(
    @InjectRepository(CMSDisplayAssignment)
    private readonly assignmentRepo: Repository<CMSDisplayAssignment>,
    @InjectRepository(CMSDisplayGroup)
    private readonly groupRepo: Repository<CMSDisplayGroup>,
    private readonly playlistService: CmsPlaylistService,
    private readonly scheduleService: CmsScheduleService,
    private readonly auditService: CmsAuditService,
    private readonly emergencyService: CmsEmergencyService,
    private readonly playerLogService: CmsPlayerLogService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `list()`/`findOne()`
     * only. `findBySlug()` stays raw — chain-resolved, reached exclusively
     * from the anonymous player routes, deferred to B5. Every write path
     * and `getActiveContent()`'s inline `groupRepo.findOne()` stay raw too.
     */
    @Inject(getTenantScopedRepositoryToken(CMSDisplayAssignment))
    private readonly scopedAssignmentRepo: TenantScopedRepository<CMSDisplayAssignment>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /** Column list shared by list()/findOne() -- every column except tenantId. */
  private static readonly ASSIGNMENT_SELECT = [
    'id', 'branchId', 'name', 'slug', 'playlistId', 'isActive', 'lastSeenAt', 'lastSeenIp',
    'isPlayerOnline', 'currentPlaylistId', 'currentItemLabel', 'currentVersionNumber',
    'lastSyncAt', 'cacheStatus', 'lastError', 'storageUsageBytes', 'groupId', 'tags',
    'maintenanceMode', 'maintenanceMessage', 'isPaused', 'tickerEnabled', 'tickerPosition',
    'tickerSpeed', 'tickerBackgroundColor', 'tickerTextColor', 'tickerFontSize', 'tickerSeparator',
    'createdBy', 'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET /cms/displays -- explicit select excludes tenantId.
  async list(branchId?: string): Promise<CMSDisplayAssignment[]> {
    return this.scopedAssignmentRepo.find({
      where: branchId ? { branchId } : {},
      order: { createdAt: 'DESC' },
      select: [...CmsDisplayService.ASSIGNMENT_SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /cms/displays/:id -- also backs
  // getDiagnostics(), update(), remove() as a write-adjacent read; none of
  // those read assignment.tenantId, so excluding it here is safe everywhere.
  async findOne(id: string): Promise<CMSDisplayAssignment> {
    const assignment = await this.scopedAssignmentRepo.findOne({
      where: { id },
      select: [...CmsDisplayService.ASSIGNMENT_SELECT],
    });
    if (!assignment) throw new NotFoundException(`Display assignment "${id}" not found`);
    return assignment;
  }

  /**
   * Production incident fix (2026-08 — "CMS Player is global instead of
   * tenant-scoped"): `tenantId` is now REQUIRED, not optional. Every
   * caller must resolve it first -- admin routes from the authenticated
   * session (via `TenantContextInterceptor`/`TenantContextStorage`), the
   * public player routes from `req.tenantId` (`SubdomainTenantMiddleware`,
   * already resolved on every request from the requesting hostname's
   * subdomain -- see that middleware's own doc comment). Filtering here
   * is what makes `/cms/player/<slug>` resolve to the CALLING tenant's own
   * display instead of whichever tenant happened to register that slug
   * first; see `1790900000000-TenantScopeCmsDisplayAssignmentSlug.ts` for
   * why the database now allows two tenants to share a slug at all (the
   * composite `(tenant_id, slug)` uniqueness this query relies on).
   */
  async findBySlug(slug: string, tenantId: string): Promise<CMSDisplayAssignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { slug, tenantId } });
    if (!assignment) throw new NotFoundException(`No display registered with slug "${slug}"`);
    return assignment;
  }

  async create(data: { branchId: string | null; name: string; slug: string; playlistId?: string | null; createdBy: string }): Promise<CMSDisplayAssignment> {
    // Fail-fast, not currentTenantIdOrNull() — a CMS display is a
    // tenant-owned entity; a missing context here must never silently
    // persist tenant_id = NULL again (see requireTenantContext()'s doc
    // comment for the incident this fixes).
    const tenantId = await this.tenantContext.requireTenantContext();

    // Production incident fix (2026-08): this uniqueness pre-check used to
    // be unscoped (`where: { slug: data.slug }`), matching the OLD global
    // database constraint -- meaning a second tenant could never register
    // a display with a slug already used by ANY other tenant (e.g. "main"),
    // even though it was never actually THEIR "main" display. Scoped to
    // this tenant to match the new composite `(tenant_id, slug)` database
    // constraint (see the migration referenced on `slug`'s own entity
    // comment) -- each tenant now has its own independent slug namespace.
    const existing = await this.assignmentRepo.findOne({ where: { slug: data.slug, tenantId } });
    if (existing) throw new ConflictException(`Display slug "${data.slug}" is already in use`);

    const assignment = this.assignmentRepo.create({
      branchId: data.branchId,
      name: data.name,
      slug: data.slug,
      playlistId: data.playlistId ?? null,
      createdBy: data.createdBy,
      tenantId,
    });
    const saved = await this.assignmentRepo.save(assignment);
    await this.auditService.log({
      entityType: 'CMSDisplayAssignment', entityId: saved.id, action: 'CREATE',
      changedBy: data.createdBy, branchId: data.branchId, summary: `Created display "${saved.name}" (/cms/player/${saved.slug})`,
    });
    return saved;
  }

  async update(id: string, data: UpdateAssignmentData, changedBy = 'unknown'): Promise<CMSDisplayAssignment> {
    const assignment = await this.findOne(id);
    if (data.name !== undefined) assignment.name = data.name;
    if (data.playlistId !== undefined) assignment.playlistId = data.playlistId;
    if (data.isActive !== undefined) assignment.isActive = data.isActive;
    if (data.groupId !== undefined) assignment.groupId = data.groupId;
    if (data.tags !== undefined) assignment.tags = data.tags;
    if (data.maintenanceMode !== undefined) assignment.maintenanceMode = data.maintenanceMode;
    if (data.maintenanceMessage !== undefined) assignment.maintenanceMessage = data.maintenanceMessage;
    if (data.tickerEnabled !== undefined) assignment.tickerEnabled = data.tickerEnabled;
    if (data.tickerPosition !== undefined) assignment.tickerPosition = data.tickerPosition;
    if (data.tickerSpeed !== undefined) assignment.tickerSpeed = data.tickerSpeed;
    if (data.tickerBackgroundColor !== undefined) assignment.tickerBackgroundColor = data.tickerBackgroundColor;
    if (data.tickerTextColor !== undefined) assignment.tickerTextColor = data.tickerTextColor;
    if (data.tickerFontSize !== undefined) assignment.tickerFontSize = data.tickerFontSize;
    if (data.tickerSeparator !== undefined) assignment.tickerSeparator = data.tickerSeparator;
    const saved = await this.assignmentRepo.save(assignment);
    await this.auditService.log({
      entityType: 'CMSDisplayAssignment', entityId: id, action: 'UPDATE',
      changedBy, summary: `Updated display "${saved.name}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy = 'unknown'): Promise<void> {
    const assignment = await this.findOne(id);
    await this.assignmentRepo.remove(assignment);
    await this.auditService.log({
      entityType: 'CMSDisplayAssignment', entityId: id, action: 'DELETE',
      changedBy, summary: `Deleted display "${assignment.name}"`,
    });
  }

  // -- Player-facing (public, unauthenticated) ----------------------------------

  /**
   * Resolves what a display should currently show. Priority chain (v1.0):
   *   1. Emergency broadcast (branch-scoped, else global) -- overrides everything.
   *   2. Maintenance mode -- the display's own flag.
   *   3. Schedule (time-of-day window + date range + priority).
   *   4. Screen group's assigned playlist (if the display belongs to a group).
   *   5. The display's own fallback `playlistId`.
   */
  async getActiveContent(slug: string, tenantId: string) {
    const assignment = await this.findBySlug(slug, tenantId);
    const base = {
      display: { name: assignment.name, slug: assignment.slug },
      isPaused: assignment.isPaused,
    };

    if (!assignment.isActive) {
      return { ...base, version: null, scheduleId: null, emergency: null, maintenance: null };
    }

    const emergency = await this.emergencyService.getActive(assignment.branchId);
    if (emergency) {
      const version = await this.playlistService.getLatestPublishedVersion(emergency.playlistId);
      return {
        ...base, version, scheduleId: null,
        emergency: { message: emergency.message, activatedAt: emergency.activatedAt },
        maintenance: null,
      };
    }

    if (assignment.maintenanceMode) {
      return {
        ...base, version: null, scheduleId: null, emergency: null,
        maintenance: { message: assignment.maintenanceMessage ?? 'System Maintenance / Please wait...' },
      };
    }

    const resolved = await this.scheduleService.resolveActivePlaylist(assignment.id);
    let playlistId = resolved.playlistId ?? assignment.playlistId;

    if (!resolved.playlistId && assignment.groupId) {
      const group = await this.groupRepo.findOne({ where: { id: assignment.groupId } });
      if (group?.playlistId) playlistId = group.playlistId;
    }

    if (!playlistId) {
      return { ...base, version: null, scheduleId: null, emergency: null, maintenance: null };
    }

    const version = await this.playlistService.getLatestPublishedVersion(playlistId);
    return { ...base, version, scheduleId: resolved.scheduleId, emergency: null, maintenance: null };
  }

  /** Legacy simple liveness ping -- kept for backward compatibility. Superseded by reportHealth(). */
  async heartbeat(slug: string, ip: string | null, tenantId: string): Promise<void> {
    const assignment = await this.findBySlug(slug, tenantId);
    assignment.lastSeenAt = new Date();
    assignment.lastSeenIp = ip;
    await this.assignmentRepo.save(assignment);
  }

  /**
   * Upserts the player's latest self-reported health snapshot (Phase 3), and
   * (v1.0) ingests any piggy-backed recent log lines for remote diagnostics.
   * Never throws on bad/partial payloads -- a malformed health report should
   * never be able to break a display's registration.
   */
  async reportHealth(slug: string, ip: string | null, report: HealthReport, tenantId: string): Promise<CMSDisplayAssignment> {
    const assignment = await this.findBySlug(slug, tenantId);

    assignment.lastSeenAt = new Date();
    assignment.lastSeenIp = ip;
    if (report.isPlayerOnline !== undefined) assignment.isPlayerOnline = report.isPlayerOnline;
    if (report.currentPlaylistId !== undefined) assignment.currentPlaylistId = report.currentPlaylistId;
    if (report.currentItemLabel !== undefined) assignment.currentItemLabel = report.currentItemLabel;
    if (report.currentVersionNumber !== undefined) assignment.currentVersionNumber = report.currentVersionNumber;
    if (report.lastSyncAt !== undefined) assignment.lastSyncAt = report.lastSyncAt ? new Date(report.lastSyncAt) : null;
    if (report.cacheStatus !== undefined) assignment.cacheStatus = report.cacheStatus;
    if (report.lastError !== undefined) assignment.lastError = report.lastError;
    if (report.storageUsageBytes !== undefined) assignment.storageUsageBytes = report.storageUsageBytes;

    const saved = await this.assignmentRepo.save(assignment);

    if (report.logs && report.logs.length > 0) {
      await this.playerLogService.ingest(assignment.id, report.logs);
    }

    return saved;
  }

  /** v1.0 Diagnostics: current state + recent logs for the admin UI, in one call. */
  async getDiagnostics(id: string) {
    const assignment = await this.findOne(id);
    const logs = await this.playerLogService.listRecent(id, 100);
    return {
      display: assignment,
      recentLogs: logs,
    };
  }
}
