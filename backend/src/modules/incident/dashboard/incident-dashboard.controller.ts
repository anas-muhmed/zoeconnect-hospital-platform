import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { IncidentDashboardService } from './incident-dashboard.service';

@ApiTags('Incident Dashboard')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/dashboard')
export class IncidentDashboardController {
  constructor(
    private readonly service: IncidentDashboardService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  @Get('executive')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Executive summary: KPIs, risk distribution, sentinel events' })
  async executive(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getExecutiveSummary(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('department-heatmap')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Incident heatmap by department and severity' })
  async heatmap(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getDepartmentHeatmap(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('investigator-workload')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Investigator workload: active and total assigned incidents' })
  async investigatorWorkload() {
    return this.service.getInvestigatorWorkload();
  }

  @Get('sla-compliance')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'SLA compliance summary: response, investigation, CAPA, closure breaches' })
  async slaCompliance() {
    return this.service.getSlaCompliance();
  }

  @Get('capa-effectiveness')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'CAPA effectiveness: status distribution and overdue count' })
  async capaEffectiveness() {
    return this.service.getCapaEffectiveness();
  }

  @Get('near-miss-ratio')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Near-miss vs actual incident ratio' })
  async nearMissRatio(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getNearMissRatio(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('lessons-learned')
  @RequirePermissions('INCIDENT:DASHBOARD:READ')
  @ApiOperation({ summary: 'Recent lessons learned from closed incidents' })
  async lessonsLearned(@Query('limit') limit?: string) {
    return this.service.getLessonsLearned(limit ? parseInt(limit, 10) : 10);
  }
}
