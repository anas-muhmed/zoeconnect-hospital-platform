import { Controller, Get, Param, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { IncidentTimelineService } from './incident-timeline.service';

import { IncidentService } from '../incidents/incident.service';

@ApiTags('Incident Timeline')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/timeline')
export class IncidentTimelineController {
  constructor(
    private readonly service: IncidentTimelineService,
    private readonly incidentService: IncidentService,
  ) {}

  @Get()
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get chronological timeline of all actions on an incident' })
  async getTimeline(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    // Verify the incident exists in the current tenant's scope (throws 404 if not)
    await this.incidentService.findOne(incidentId);
    return this.service.getForIncident(incidentId);
  }
}
