import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvAnalyticsService } from './cv-analytics.service';

@Controller('childrens-village/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('CHILDRENS_VILLAGE')
export class CvAnalyticsController {
  constructor(private readonly analyticsService: CvAnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('CV:ANALYTICS:READ')
  async getDashboard() {
    return this.analyticsService.getDashboardStats();
  }
}
