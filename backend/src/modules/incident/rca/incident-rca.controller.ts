import {
  Controller, Get, Post, Patch, Delete, Param, Body,
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
import { IncidentRcaService } from './incident-rca.service';
import { CreateRcaDto, UpdateRcaDto, AddFiveWhyDto, UpsertFishboneNodeDto } from '../dto/incident-rca.dto';

@ApiTags('Incident RCA')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/rca')
export class IncidentRcaController {
  constructor(private readonly service: IncidentRcaService) {}

  @Get()
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  findAll(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.findAll(incidentId);
  }

  @Post()
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  @ApiOperation({ summary: 'Start a new RCA analysis for the incident' })
  create(@Param('incidentId', ParseUUIDPipe) incidentId: string, @Body() dto: CreateRcaDto, @CurrentUser() actor: User) {
    return this.service.create(incidentId, dto, actor);
  }

  @Patch(':rcaId')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  @ApiOperation({ summary: 'Update RCA (completing it transitions incident to CAPA_PENDING)' })
  update(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('rcaId', ParseUUIDPipe) rcaId: string,
    @Body() dto: UpdateRcaDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.update(incidentId, rcaId, dto, actor);
  }

  @Post(':rcaId/five-why')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  @ApiOperation({ summary: 'Add or update a Five Why entry (whyNumber 1–5)' })
  addFiveWhy(@Param('rcaId', ParseUUIDPipe) rcaId: string, @Body() dto: AddFiveWhyDto, @CurrentUser() actor: User) {
    return this.service.addFiveWhy(rcaId, dto, actor);
  }

  @Get(':rcaId/five-why')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  getFiveWhys(@Param('rcaId', ParseUUIDPipe) rcaId: string) {
    return this.service.getFiveWhys(rcaId);
  }

  @Post(':rcaId/fishbone')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  @ApiOperation({ summary: 'Create or update a Fishbone diagram node' })
  upsertFishbone(@Param('rcaId', ParseUUIDPipe) rcaId: string, @Body() dto: UpsertFishboneNodeDto, @CurrentUser() actor: User) {
    return this.service.upsertFishboneNode(rcaId, dto, actor);
  }

  @Get(':rcaId/fishbone')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  getFishbone(@Param('rcaId', ParseUUIDPipe) rcaId: string) {
    return this.service.getFishboneNodes(rcaId);
  }

  @Delete(':rcaId/fishbone/:nodeId')
  @RequirePermissions('INCIDENT:RCA:MANAGE')
  deleteFishboneNode(@Param('rcaId', ParseUUIDPipe) rcaId: string, @Param('nodeId', ParseUUIDPipe) nodeId: string) {
    return this.service.deleteFishboneNode(rcaId, nodeId);
  }
}
