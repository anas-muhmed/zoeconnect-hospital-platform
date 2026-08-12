import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
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
import { IncidentService } from './incident.service';
import {
  CreateIncidentDto, ListIncidentsDto, AssignIncidentDto, UpdateIncidentDto, UpdateResidualRiskDto,
} from '../dto/incident.dto';

@ApiTags('Incidents')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident')
export class IncidentController {
  constructor(private readonly service: IncidentService) {}

  @Post()
  @RequirePermissions('INCIDENT:INCIDENTS:CREATE')
  @ApiOperation({ summary: 'Report a new incident (creates as DRAFT)' })
  create(@Body() dto: CreateIncidentDto, @CurrentUser() actor: User) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'List incidents with filters and pagination' })
  findAll(@Query() filters: ListIncidentsDto) {
    return this.service.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get full incident detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Update incident fields (draft or active)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto, @CurrentUser() actor: User) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermissions('INCIDENT:INCIDENTS:DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a DRAFT incident' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.service.remove(id, actor);
  }

  // ── Workflow transitions ──────────────────────────────────────────────────

  @Post(':id/submit')
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Submit a draft incident for review' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.service.transition(id, 'SUBMITTED', actor);
  }

  @Post(':id/acknowledge')
  @RequirePermissions('INCIDENT:INCIDENTS:ASSIGN')
  @ApiOperation({ summary: 'Acknowledge a submitted incident' })
  acknowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.service.transition(id, 'ACKNOWLEDGED', actor);
  }

  @Post(':id/assign')
  @RequirePermissions('INCIDENT:INCIDENTS:ASSIGN')
  @ApiOperation({ summary: 'Assign an investigator to the incident' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignIncidentDto, @CurrentUser() actor: User) {
    return this.service.assign(id, dto, actor);
  }

  @Post(':id/reopen')
  @RequirePermissions('INCIDENT:INCIDENTS:CLOSE')
  @ApiOperation({ summary: 'Reopen a closed incident for re-investigation' })
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.service.transition(id, 'INVESTIGATION', actor, { reason: 'Controlled reopen' });
  }

  @Patch(':id/residual-risk')
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Update residual risk score (pre or post CAPA)' })
  updateResidualRisk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResidualRiskDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.updateResidualRisk(id, dto, actor);
  }
}
