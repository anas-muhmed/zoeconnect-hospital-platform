import {
  Controller, Get, Post, Param, Body, Query,
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
import { IncidentVerificationService } from './incident-verification.service';
import { VerifyCapaDto } from '../dto/incident-verification.dto';

@ApiTags('Incident Verification')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId')
export class IncidentVerificationController {
  constructor(private readonly service: IncidentVerificationService) {}

  @Post('capa/:capaId/verify')
  @RequirePermissions('INCIDENT:CAPA:VERIFY')
  @ApiOperation({ summary: 'Verify or reject a completed CAPA (quality team only)' })
  verify(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('capaId', ParseUUIDPipe) capaId: string,
    @Body() dto: VerifyCapaDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.verify(incidentId, capaId, dto, actor);
  }

  @Get('verification')
  @RequirePermissions('INCIDENT:CAPA:VERIFY')
  @ApiOperation({ summary: 'Get all verification records for an incident' })
  getAll(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.getForIncident(incidentId);
  }
}
