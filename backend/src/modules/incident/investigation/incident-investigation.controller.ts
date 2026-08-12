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
import { IncidentInvestigationService } from './incident-investigation.service';
import { CreateInvestigationDto, UpdateInvestigationDto, AddStatementDto } from '../dto/incident-investigation.dto';

@ApiTags('Incident Investigation')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/investigation')
export class IncidentInvestigationController {
  constructor(private readonly service: IncidentInvestigationService) {}

  @Get()
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'List all investigations for an incident' })
  findAll(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.findAll(incidentId);
  }

  @Post()
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Start a new investigation (transitions incident to INVESTIGATION)' })
  create(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateInvestigationDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.create(incidentId, dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Update investigation (completing it transitions to RCA_PENDING)' })
  update(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvestigationDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.update(incidentId, id, dto, actor);
  }

  @Post(':id/statement')
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Add a witness or staff statement to an investigation' })
  addStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStatementDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.addStatement(id, dto, actor);
  }

  @Get(':id/statements')
  @RequirePermissions('INCIDENT:INVESTIGATIONS:MANAGE')
  @ApiOperation({ summary: 'Get all statements for an investigation' })
  getStatements(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStatements(id);
  }
}
