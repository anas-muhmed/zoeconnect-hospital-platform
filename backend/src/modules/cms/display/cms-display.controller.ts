import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsDisplayService, HealthReport, UpdateAssignmentData } from './cms-display.service';
import { CmsDisplayCommandService } from '../commands/cms-display-command.service';
import { CmsSettingsService } from '../settings/cms-settings.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

interface CreateAssignmentDto { name: string; slug: string; playlistId?: string | null; }

@Controller('cms')
export class CmsDisplayController {
  constructor(
    private readonly displayService: CmsDisplayService,
    private readonly commandService: CmsDisplayCommandService,
    private readonly settingsService: CmsSettingsService,
  ) {}

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  // -- Admin: display assignments (authenticated) --------------------------------

  /**
   * Stage B (Checkpoint B3.6) — `TenantContextInterceptor` applied per-route
   * (not class-level) on this controller, since it mixes session-resolved
   * admin routes with chain-resolved public player routes below. Applied
   * to routes whose call chain reaches a scoped repository — `list`,
   * `findOne`, `diagnostics` directly; `update`/`remove` because they call
   * the now-scoped `displayService.findOne()` internally as a write-adjacent
   * read.
   *
   * Fix (2026-08-07) — `create` was previously excluded on the reasoning
   * that it "never touches a scoped method," which is true but incomplete:
   * it still calls `tenantContext.currentTenantIdOrNull()` to stamp the new
   * row's `tenantId` (service.ts). Without this interceptor establishing
   * context first, that call always returned `null` (no context = no
   * context, regardless of which repository is used downstream), so every
   * display was created with `tenant_id = NULL` — invisible to `list()`
   * (which IS scoped and filters on the real tenant id), while still
   * colliding on the raw, unscoped slug-uniqueness check on the next
   * attempt with the same name. Root-caused from a live "New Display
   * shows nothing, then 409s on retry" report; see the CMS module-wide
   * audit in HYBRID_ARCHITECTURE_LOG.md for the same pattern found in
   * `CmsTickerController.create()`.
   *
   * A `TenantScopedRepository` dry-run call always calls
   * `TenantContextStorage.currentTenantId()` for its comparison log (except
   * system scope), which throws if no context was established — so any
   * route reaching a scoped method without this interceptor would break the
   * endpoint, not silently no-op.
   */
  @Get('displays')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  list(@ActiveBranchId() branchId: string) {
    return this.displayService.list(branchId);
  }

  @Get('displays/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  findOne(@Param('id') id: string) {
    return this.displayService.findOne(id);
  }

  @Get('displays/:id/diagnostics')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  diagnostics(@Param('id') id: string) {
    return this.displayService.getDiagnostics(id);
  }

  @Post('displays')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  create(@Body() dto: CreateAssignmentDto, @Request() req: any, @ActiveBranchId() branchId: string | null) {
    return this.displayService.create({ ...dto, branchId, createdBy: this._userId(req) });
  }

  @Patch('displays/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentData, @Request() req: any) {
    return this.displayService.update(id, dto, this._userId(req));
  }

  @Delete('displays/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.displayService.remove(id, this._userId(req));
  }

  // -- Player (public, no auth) ---------------------------------------------------
  //
  // Production incident fix (2026-08 — "CMS Player is global instead of
  // tenant-scoped"): these routes are deliberately unauthenticated (a
  // physical kiosk/TV player cannot log in), so `TenantContextInterceptor`
  // (which derives tenant from the authenticated principal) doesn't apply
  // here and never has. That's not the gap -- the gap was that these
  // handlers never read the tenant identity that WAS already available on
  // every request: `req.tenantId`, resolved by `SubdomainTenantMiddleware`'s
  // Fastify `onRequest` hook (registered in `main.ts`, runs before any
  // guard/interceptor, on every request) from the requesting hostname's
  // subdomain. `_tenantId()` below is the single place that reads it, with
  // a fail-loud guard: a request with no resolvable tenant is refused
  // rather than silently falling through to an unscoped lookup (which is
  // exactly the bug this fixes). Self-hosted installs are unaffected --
  // there every hostname resolves to the single seeded 'default' tenant
  // (see `SubdomainTenantMiddleware`'s own doc comment), so `req.tenantId`
  // is always populated there too.

  private _tenantId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const tenantId: string | undefined = req.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Unable to resolve tenant for this request -- the CMS player must be loaded from a valid tenant hostname.');
    }
    return tenantId;
  }

  @Get('player/:slug/active-content')
  getActiveContent(@Param('slug') slug: string, @Request() req: any) {
    return this.displayService.getActiveContent(slug, this._tenantId(req));
  }

  @Post('player/:slug/heartbeat')
  heartbeat(@Param('slug') slug: string, @Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ip: string | null = req.ip ?? null;
    return this.displayService.heartbeat(slug, ip, this._tenantId(req));
  }

  /** Phase 3: richer periodic health/telemetry report from the player. v1.0: also carries recent logs. */
  @Post('player/:slug/health')
  reportHealth(@Param('slug') slug: string, @Body() report: HealthReport, @Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ip: string | null = req.ip ?? null;
    return this.displayService.reportHealth(slug, ip, report ?? {}, this._tenantId(req));
  }

  /** v1.0: player polls for pending remote commands (Refresh/Restart/ClearCache/ForceSync) on each cycle. */
  @Get('player/:slug/commands')
  async listPendingCommands(@Param('slug') slug: string, @Request() req: any) {
    const assignment = await this.displayService.findBySlug(slug, this._tenantId(req));
    return this.commandService.listPending(assignment.id);
  }

  /** v1.0: player acknowledges it has executed a command. */
  @Post('player/commands/:commandId/ack')
  ackCommand(@Param('commandId') commandId: string) {
    return this.commandService.acknowledge(commandId);
  }

  /** v1.0: public, unauthenticated -- lets the player self-configure its poll/heartbeat/retry
   *  intervals from CMSSettings instead of hardcoding "magic constants" in the frontend. */
  @Get('player/settings')
  async getPlayerSettings() {
    const s = await this.settingsService.get();
    return {
      playerPollIntervalMs: s.playerPollIntervalMs,
      heartbeatIntervalMs: s.heartbeatIntervalMs,
      retryCount: s.retryCount,
      retryDelayMs: s.retryDelayMs,
      offlineTimeoutMs: s.offlineTimeoutMs,
      maxCacheSizeMb: s.maxCacheSizeMb,
      defaultImageDurationSeconds: s.defaultImageDurationSeconds,
    };
  }
}
