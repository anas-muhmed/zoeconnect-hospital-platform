import { Controller, Get, Param, NotFoundException, Logger } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { DisplayService } from './display.service';
import { TenantContextService } from '../../platform/tenant/tenant-context.service';

/**
 * Public Token Display API routes for Cloud Architecture (Path-based tenant resolution)
 * Replaces the legacy `/display/:slug` global behavior.
 */
@Controller('token/display')
export class TokenPublicDisplayController {
  private readonly logger = new Logger(TokenPublicDisplayController.name);

  constructor(
    private readonly displayService: DisplayService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Get(':tenantCode/:slug')
  @Public()
  async getDisplayByTenantAndSlug(
    @Param('tenantCode') tenantCode: string,
    @Param('slug') slug: string,
  ) {
    this.logger.debug(`[getDisplayByTenantAndSlug] Attempting to resolve tenant code: '${tenantCode}', slug: '${slug}'`);
    this.logger.debug(`[getDisplayByTenantAndSlug] process.env.DEPLOYMENT_MODE = '${process.env.DEPLOYMENT_MODE}'`);
    const tenantId = await this.tenantContextService.resolveTenantIdByCode(tenantCode);
    
    if (!tenantId) {
      this.logger.warn(`[getDisplayByTenantAndSlug] resolveTenantIdByCode returned null for tenantCode: '${tenantCode}'`);
      throw new NotFoundException(
        `Tenant code '${tenantCode}' not found. [DIAGNOSTIC: DEPLOYMENT_MODE=${process.env.DEPLOYMENT_MODE || 'undefined'}]`
      );
    }
    
    this.logger.debug(`[getDisplayByTenantAndSlug] Tenant code '${tenantCode}' resolved to tenantId: '${tenantId}'. Searching for display page...`);
    
    try {
      const display = await this.displayService.findByTenantAndSlug(tenantId, slug);
      this.logger.debug(`[getDisplayByTenantAndSlug] Successfully found display page '${slug}' for tenantId: '${tenantId}'`);
      return display;
    } catch (error) {
      this.logger.warn(`[getDisplayByTenantAndSlug] Failed to find display page. Slug: '${slug}', TenantId: '${tenantId}'. Error: ${(error as Error).message}`);
      throw new NotFoundException(
        `Display page '${slug}' not found. [DIAGNOSTIC: Searched with tenantId='${tenantId}'. If this display exists in the UI, its database tenant_id is likely NULL due to the missing interceptor bug on creation.]`
      );
    }
  }
}
