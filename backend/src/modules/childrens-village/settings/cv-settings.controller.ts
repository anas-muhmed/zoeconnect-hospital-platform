import { Controller, Get, Patch, Body, UseGuards, UseInterceptors, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvSettingsService } from './cv-settings.service';
import { UpdateCvSettingsDto } from './dto/update-cv-settings.dto';

/**
 * Module-wide, admin-tunable configuration for Children's Village --
 * mirrors FeedbackSettingsController's shape (`feedback/settings`) exactly.
 * `CV:SETTINGS:MANAGE` is granted to SUPER_ADMIN and HOSPITAL_ADMIN only
 * (see the permission migration) -- "admin/superadmin", not every CV role.
 */
@ApiTags('Children\'s Village Settings')
@ApiBearerAuth('JWT')
@Controller('childrens-village/settings')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvSettingsController {
  constructor(private readonly settingsService: CvSettingsService) {}

  @Get()
  @RequirePermissions('CV:SETTINGS:MANAGE')
  @ApiOperation({ summary: "Get module-wide Children's Village settings" })
  get() {
    return this.settingsService.getForCurrentTenant();
  }

  @Patch()
  @RequirePermissions('CV:SETTINGS:MANAGE')
  @ApiOperation({ summary: "Update module-wide Children's Village settings" })
  update(@Body() dto: UpdateCvSettingsDto, @Request() req: any) {
    return this.settingsService.update(dto, req.user.userId);
  }
}
