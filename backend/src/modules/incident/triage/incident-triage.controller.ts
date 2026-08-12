import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { IncidentTriageService } from './incident-triage.service';
import { CreateTriageDto, UpdateTriageDto } from '../dto/incident-triage.dto';

@ApiTags('Incident Triage')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/triage')
export class IncidentTriageController {
  constructor(private readonly service: IncidentTriageService) {}

  @Get()
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get triage assessment for an incident' })
  get(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.get(incidentId);
  }

  @Post()
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Create triage assessment (transitions incident to TRIAGE stage)' })
  create(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateTriageDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.create(incidentId, dto, actor);
  }

  @Patch()
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Update triage assessment' })
  update(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: UpdateTriageDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.update(incidentId, dto, actor);
  }

  @Post('begin-containment')
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Move incident from TRIAGE into CONTAINMENT' })
  beginContainment(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() actor: User,
  ) {
    return this.service.beginContainment(incidentId, actor);
  }
}
