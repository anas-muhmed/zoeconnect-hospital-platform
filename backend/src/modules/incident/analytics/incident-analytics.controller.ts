import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { IncidentAnalyticsService } from './incident-analytics.service';

@ApiTags('Incident Analytics')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/analytics')
export class IncidentAnalyticsController {
  constructor(
    private readonly service: IncidentAnalyticsService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private parseDateRange(from?: string, to?: string) {
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), 0, 1);
    const toDate = to ? new Date(to) : now;
    return { fromDate, toDate };
  }

  @Get('trends')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Incident trend data (monthly/quarterly/yearly)' })
  async trends(
    @Query('granularity') granularity: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' = 'MONTHLY',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { fromDate, toDate } = this.parseDateRange(from, to);
    return this.service.getTrends(tenantId, granularity, fromDate, toDate);
  }

  @Get('categories')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Incident count by category' })
  async categories(@Query('from') from?: string, @Query('to') to?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { fromDate, toDate } = this.parseDateRange(from, to);
    return this.service.getCategoryBreakdown(tenantId, fromDate, toDate);
  }

  @Get('repeat-incidents')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Repeat incidents by category + department combination' })
  async repeatIncidents(@Query('from') from?: string, @Query('to') to?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { fromDate, toDate } = this.parseDateRange(from, to);
    return this.service.getRepeatIncidents(tenantId, fromDate, toDate);
  }

  @Get('investigation-time')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Average investigation completion time (hours)' })
  async investigationTime(@Query('from') from?: string, @Query('to') to?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { fromDate, toDate } = this.parseDateRange(from, to);
    return this.service.getAverageInvestigationTime(tenantId, fromDate, toDate);
  }

  @Get('sentinel-events')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Sentinel event trend by month' })
  async sentinelEvents(@Query('from') from?: string, @Query('to') to?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const { fromDate, toDate } = this.parseDateRange(from, to);
    return this.service.getSentinelEventTrend(tenantId, fromDate, toDate);
  }
}
