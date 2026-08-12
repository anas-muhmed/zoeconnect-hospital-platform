import {
  Controller, Get, Post, Param, Body, Request, NotFoundException
} from '@nestjs/common';
import { CmsDisplayService, HealthReport } from './cms-display.service';
import { CmsDisplayCommandService } from '../commands/cms-display-command.service';
import { CmsSettingsService } from '../settings/cms-settings.service';
import { CmsTickerService } from '../ticker/cms-ticker.service';
import { TenantContextService } from '../../platform/tenant/tenant-context.service';

/**
 * Public CMS Player API routes for Cloud Architecture (Path-based tenant resolution)
 * Replaces the legacy `/cms/player/:slug` endpoints that relied on SubdomainTenantMiddleware.
 */
@Controller('player')
export class CmsPublicPlayerController {
  constructor(
    private readonly displayService: CmsDisplayService,
    private readonly commandService: CmsDisplayCommandService,
    private readonly settingsService: CmsSettingsService,
    private readonly tickerService: CmsTickerService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  private async _resolveTenantIdOrThrow(tenantCode: string): Promise<string> {
    const tenantId = await this.tenantContextService.resolveTenantIdByCode(tenantCode);
    if (!tenantId) {
      throw new NotFoundException(`Tenant code '${tenantCode}' not found.`);
    }
    return tenantId;
  }

  @Get(':tenantCode/:slug/active-content')
  async getActiveContent(@Param('tenantCode') tenantCode: string, @Param('slug') slug: string) {
    const tenantId = await this._resolveTenantIdOrThrow(tenantCode);
    return this.displayService.getActiveContent(slug, tenantId);
  }

  @Post(':tenantCode/:slug/heartbeat')
  async heartbeat(@Param('tenantCode') tenantCode: string, @Param('slug') slug: string, @Request() req: any) {
    const tenantId = await this._resolveTenantIdOrThrow(tenantCode);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ip: string | null = req.ip ?? null;
    return this.displayService.heartbeat(slug, ip, tenantId);
  }

  @Post(':tenantCode/:slug/health')
  async reportHealth(@Param('tenantCode') tenantCode: string, @Param('slug') slug: string, @Body() report: HealthReport, @Request() req: any) {
    const tenantId = await this._resolveTenantIdOrThrow(tenantCode);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const ip: string | null = req.ip ?? null;
    return this.displayService.reportHealth(slug, ip, report ?? {}, tenantId);
  }

  @Get(':tenantCode/:slug/commands')
  async listPendingCommands(@Param('tenantCode') tenantCode: string, @Param('slug') slug: string) {
    const tenantId = await this._resolveTenantIdOrThrow(tenantCode);
    const assignment = await this.displayService.findBySlug(slug, tenantId);
    return this.commandService.listPending(assignment.id);
  }

  @Post('commands/:commandId/ack')
  ackCommand(@Param('commandId') commandId: string) {
    // Ack is global and independent of tenant context via commandId PK
    return this.commandService.acknowledge(commandId);
  }

  @Get(':tenantCode/:slug/ticker')
  async getTickerForPlayer(@Param('tenantCode') tenantCode: string, @Param('slug') slug: string) {
    const tenantId = await this._resolveTenantIdOrThrow(tenantCode);
    return this.tickerService.getForPlayer(slug, tenantId);
  }

  @Get('settings')
  async getPlayerSettings() {
    // Global player configuration
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
