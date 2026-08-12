import {
  Controller, Get, Post, Patch, Param, Body, Query,
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
import { IncidentCapaService } from './incident-capa.service';
import { CreateCapaDto, UpdateCapaDto } from '../dto/incident-capa.dto';

@ApiTags('Incident CAPA')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/capa')
export class IncidentCapaController {
  constructor(private readonly service: IncidentCapaService) {}

  @Get()
  @RequirePermissions('INCIDENT:CAPA:MANAGE')
  @ApiOperation({ summary: 'List all CAPAs for an incident' })
  findAll(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.findAll(incidentId);
  }

  @Post()
  @RequirePermissions('INCIDENT:CAPA:MANAGE')
  @ApiOperation({ summary: 'Create a new CAPA (Corrective or Preventive Action)' })
  create(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateCapaDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.create(incidentId, dto, actor);
  }

  @Patch(':capaId')
  @RequirePermissions('INCIDENT:CAPA:MANAGE')
  @ApiOperation({ summary: 'Update CAPA status/progress (completing all transitions to VERIFICATION)' })
  update(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('capaId', ParseUUIDPipe) capaId: string,
    @Body() dto: UpdateCapaDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.update(incidentId, capaId, dto, actor);
  }
}
