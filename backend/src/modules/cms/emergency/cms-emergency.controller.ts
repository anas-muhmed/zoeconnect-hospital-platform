import { Controller, Get, Post, Patch, Param, Body, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsEmergencyService } from './cms-emergency.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequireFeatureGuard } from '../../platform/feature-flags/guards/require-feature.guard';
import { RequireFeature } from '../../platform/feature-flags/decorators/require-feature.decorator';

/**
 * Task 11.3 (Phase 11 pilot migration): `activate()`/`deactivate()` are now
 * gated by `@RequireFeature('cms.emergency-broadcast')`, proving the
 * `@RequireFeature()` pattern on one real, already-live capability before
 * wider adoption (per the roadmap's own Task 11.3 wording). `listActive()`/
 * `listHistory()` (read-only) are deliberately left ungated — disabling the
 * feature flag should stop new broadcasts from being *activated*, not hide
 * the history of ones that already ran. CMS has no `@RequireModule()`
 * module-level gate today (verified during this phase's pre-flight — no
 * existing controller applies one), so `RequireFeatureGuard` here is the
 * only gate in play; no ordering-relative-to-LicenseGuard concern applies
 * to this specific controller, though the decorator's own doc comment
 * documents the correct ordering for a module that does have one.
 *
 * The migration seeding a platform-wide 'enabled' row for this exact
 * feature key (see `1783850000000-CreateFeatureFlags.ts`) means this
 * change is behavior-neutral by default — existing deployments see no
 * change until an admin explicitly disables the flag via the new
 * `/platform/feature-flags` admin API (Task 11.4).
 */
@Controller('cms/emergency')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
export class CmsEmergencyController {
  constructor(private readonly emergencyService: CmsEmergencyService) {}

  private _userId(req: any): string {
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Get('active')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  listActive(@ActiveBranchId() branchId: string) {
    return this.emergencyService.listActive(branchId);
  }

  @Get('history')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  listHistory(@ActiveBranchId() branchId: string) {
    return this.emergencyService.listHistory(branchId);
  }

  @Post()
  @UseGuards(RequireFeatureGuard)
  @RequireFeature('cms.emergency-broadcast')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  activate(
    @Body() body: { branchId: string | null; playlistId: string; message: string },
    @ActiveBranchId() activeBranchId: string,
    @Request() req: any,
  ) {
    return this.emergencyService.activate(
      { branchId: body.branchId ?? activeBranchId ?? null, playlistId: body.playlistId, message: body.message },
      this._userId(req),
    );
  }

  @Patch(':id/deactivate')
  @UseGuards(RequireFeatureGuard)
  @RequireFeature('cms.emergency-broadcast')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  deactivate(@Param('id') id: string, @Request() req: any) {
    return this.emergencyService.deactivate(id, this._userId(req));
  }
}
