import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryBodyReleasesService } from '../services/mortuary-body-releases.service';
import { CreateMortuaryBodyReleaseDto } from '../dto/create-mortuary-body-release.dto';

/**
 * Mortuary integration (Phase 2, Stage D). Ports `releaseController.js`
 * (body release + release history) and `releaseHistoryRoutes.js`.
 * Permission matrix: see Stage D report §2/§3. NOC/legal-document file
 * upload deferred to Stage E.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary')
export class MortuaryBodyReleasesController {
  constructor(private readonly releasesService: MortuaryBodyReleasesService) {}

  @Post('body-releases')
  @RequirePermissions('MORTUARY:RELEASES:CREATE')
  create(@CurrentUser() user: User, @Body() dto: CreateMortuaryBodyReleaseDto) {
    return this.releasesService.create(user.tenantId, dto);
  }

  @Get('body-releases/:bodyId')
  @RequirePermissions('MORTUARY:RELEASES:READ')
  findByBodyId(@CurrentUser() user: User, @Param('bodyId') bodyId: string) {
    return this.releasesService.findByBodyId(user.tenantId, bodyId);
  }

  @Get('release-history')
  @RequirePermissions('MORTUARY:RELEASES:READ')
  findHistory(@CurrentUser() user: User) {
    return this.releasesService.findHistory(user.tenantId);
  }
}
