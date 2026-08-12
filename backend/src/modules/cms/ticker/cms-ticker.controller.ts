import {
  Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CmsTickerService, TickerMessageInput } from './cms-ticker.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@Controller('cms')
export class CmsTickerController {
  constructor(private readonly tickerService: CmsTickerService) {}

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  /**
   * Stage B (Checkpoint B3.6) — `TenantContextInterceptor` applied per-route
   * on this controller (mixed session-resolved admin + chain-resolved public
   * player, same reasoning as `CmsDisplayController`). `list()` is NOT
   * covered — `listForDisplay()` stays on the raw repository because it's
   * also reached from the anonymous `getForPlayer()` chain. `update()`/
   * `remove()` ARE covered — both call `this.findOne(id)` internally as a
   * write-adjacent read, which is now scoped.
   *
   * Fix (2026-08-07) — `create()` was previously excluded on the same
   * (incomplete) reasoning as `CmsDisplayController.create()`: it doesn't
   * call a scoped repository method, but it does call
   * `tenantContext.currentTenantIdOrNull()` to stamp `tenantId` on the new
   * row (cms-ticker.service.ts), which silently returned `null` with no
   * interceptor establishing context first. `listForDisplay()` being
   * unscoped meant this didn't manifest as an *invisible* row like CMS
   * Displays did, but every ticker message created through this route was
   * still persisted with `tenant_id = NULL` — and because `update()`/
   * `remove()` DO go through the scoped `findOne()`, those tenant_id=NULL
   * rows could be listed but never edited or deleted (404) once found.
   * Found during the module-wide audit that root-caused the CMS Displays
   * bug; see HYBRID_ARCHITECTURE_LOG.md.
   */
  @Get('displays/:displayId/ticker-messages')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  list(@Param('displayId') displayId: string) {
    return this.tickerService.listForDisplay(displayId);
  }

  @Post('displays/:displayId/ticker-messages')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  create(@Param('displayId') displayId: string, @Body() dto: TickerMessageInput, @Request() req: any) {
    return this.tickerService.create(displayId, dto, this._userId(req));
  }

  @Patch('ticker-messages/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  update(@Param('id') id: string, @Body() dto: Partial<TickerMessageInput>, @Request() req: any) {
    return this.tickerService.update(id, dto, this._userId(req));
  }

  @Delete('ticker-messages/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(TenantContextInterceptor)
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tickerService.remove(id, this._userId(req));
  }

  // -- Player (public, no auth) ----------------------------------------------------
  //
  // Production incident fix (2026-08 — "CMS Player is global instead of
  // tenant-scoped"): same fix as `CmsDisplayController._tenantId()`,
  // duplicated here rather than shared via a base class since this
  // controller has no other coupling to CmsDisplayController and the two
  // modules are otherwise independent. See that controller's comment for
  // the full rationale.

  private _tenantId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const tenantId: string | undefined = req.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Unable to resolve tenant for this request -- the CMS player must be loaded from a valid tenant hostname.');
    }
    return tenantId;
  }

  /** Polled independently of active-content -- the ticker overlay is not part of the playlist rotation. */
  @Get('player/:slug/ticker')
  getForPlayer(@Param('slug') slug: string, @Request() req: any) {
    return this.tickerService.getForPlayer(slug, this._tenantId(req));
  }
}
