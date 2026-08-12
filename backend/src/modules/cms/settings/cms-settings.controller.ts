import { Controller, Get, Patch, Body, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CmsSettingsService } from './cms-settings.service';
import { CMSSettings } from '../entities/cms-settings.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

/**
 * Fix (2026-08-07): this controller had NO `TenantContextInterceptor`
 * anywhere (class or method level) — found during the multi-hop
 * service-layer bypass audit that followed the CMS Displays incident (see
 * HYBRID_ARCHITECTURE_LOG.md). `update()` doesn't call
 * `currentTenantIdOrNull()`/`requireTenantContext()` itself, but it reaches
 * `CmsAuditService.log()` two hops down
 * (`CmsSettingsService.update()` -> `auditService.log()`), which does. With
 * no tenant context established anywhere in that chain, every settings
 * change's audit-trail row was silently persisted with `tenant_id = NULL`
 * — invisible to `listRecent()`/`listForEntity()`'s tenant-scoped reads.
 * `CMSSettings` itself is a deliberate global singleton (see its own entity
 * comment), so this was an audit-trail gap, not a cross-tenant data leak —
 * but the same missing-interceptor shape as the four write-path bugs this
 * fixed the same day. Applied class-level since both routes here are
 * ordinary authenticated admin routes (no public/anonymous mixing, unlike
 * `CmsDisplayController`).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms/settings')
export class CmsSettingsController {
  constructor(private readonly settingsService: CmsSettingsService) {}

  private _userId(req: any): string {
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Get()
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  update(@Body() patch: Partial<Omit<CMSSettings, 'id' | 'updatedAt'>>, @Request() req: any) {
    return this.settingsService.update(patch, this._userId(req));
  }
}
