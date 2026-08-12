import {
  Controller, Post, Param, Body, Get,
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
import { IncidentClosureService } from './incident-closure.service';
import { CloseIncidentDto } from '../dto/incident-closure.dto';

@ApiTags('Incident Closure')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/close')
export class IncidentClosureController {
  constructor(private readonly service: IncidentClosureService) {}

  @Post()
  @RequirePermissions('INCIDENT:INCIDENTS:CLOSE')
  @ApiOperation({ summary: 'Formally close an incident (requires INCIDENTS:CLOSE permission)' })
  close(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CloseIncidentDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.close(incidentId, dto, actor);
  }

  @Get()
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get closure record for an incident' })
  getClosure(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.getClosure(incidentId);
  }
}
