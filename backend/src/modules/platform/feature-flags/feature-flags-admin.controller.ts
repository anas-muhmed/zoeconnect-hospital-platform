import {
  Body, Controller, Get, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';

/**
 * FeatureFlagsAdminController (Phase 11, Task 11.4).
 *
 * "Extend Task 10.7's admin surface" per the roadmap — same internal,
 * `SUPER_ADMIN`-only pattern as `TenantProvisioningController`
 * (`JwtAuthGuard` + `RolesGuard` + `@Roles('SUPER_ADMIN')`), kept as its
 * own controller/module rather than added to
 * `tenant-provisioning.controller.ts` directly, since feature flags are a
 * conceptually separate resource (Phase 11, not Phase 10) — "extend the
 * admin surface" is read here as "extend the pattern," not "extend the
 * file."
 */
@Controller('platform/feature-flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class FeatureFlagsAdminController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  async list(@Query('tenantId') tenantId?: string) {
    if (tenantId === 'global') {
      return this.featureFlagsService.listFlags(null);
    }
    return this.featureFlagsService.listFlags(tenantId ?? undefined);
  }

  @Post()
  async upsert(@Body() dto: UpsertFeatureFlagDto, @Request() req: any) {
    const updatedBy = req.user?.username ?? req.user?.id ?? req.user?.sub ?? 'unknown';
    return this.featureFlagsService.setFlag({
      tenantId: dto.tenantId ?? null,
      featureKey: dto.featureKey,
      state: dto.state,
      rolloutPercentage: dto.rolloutPercentage ?? null,
      description: dto.description ?? null,
      updatedBy,
    });
  }
}
