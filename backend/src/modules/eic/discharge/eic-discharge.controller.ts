import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EicDischargeService } from './eic-discharge.service';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import { Audit }              from '../../../common/decorators/audit.decorator';
import type { User }          from '../../users/entities/user.entity';
import { EicDiscipline }      from '../common/enums/discipline.enum';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Discharge')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic')
export class EicDischargeController {
  constructor(private readonly dischargeSvc: EicDischargeService) {}

  @Post('enrollments/:enrollmentId/discharge')
  @RequirePermissions('EIC:DISCHARGE:CREATE')
  @Audit({ action: 'EIC_DISCHARGE_INITIATE', module: 'EIC', entityType: 'eic_discharge_summaries' })
  @ApiOperation({ summary: 'Initiate discharge for an enrollment' })
  initiate(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() body: { dischargeReason: string; dischargeDate: string; disciplines: EicDiscipline[] },
    @CurrentUser() actor: User,
  ) {
    return this.dischargeSvc.initiate(
      enrollmentId, body.dischargeReason, body.dischargeDate, body.disciplines, actor.id,
    );
  }

  @Get('enrollments/:enrollmentId/discharge')
  @RequirePermissions('EIC:PROGRESS_REPORTS:READ')
  @ApiOperation({ summary: 'Get discharge summary for enrollment' })
  findByEnrollment(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.dischargeSvc.findByEnrollment(enrollmentId);
  }

  @Get('discharge/:id')
  @RequirePermissions('EIC:PROGRESS_REPORTS:READ')
  @ApiOperation({ summary: 'Get discharge summary by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.dischargeSvc.findById(id);
  }

  @Patch('discharge/:id')
  @RequirePermissions('EIC:DISCHARGE:CREATE')
  @ApiOperation({ summary: 'Update discharge header fields (overallProgress, homeProgramme, followUpPlan)' })
  updateHeader(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { overallProgress?: string; homeProgramme?: string; followUpPlan?: string },
  ) {
    return this.dischargeSvc.updateHeader(id, body);
  }

  @Patch('discharge/:id/sections/:discipline')
  @RequirePermissions('EIC:PROGRESS_REPORTS:CREATE')
  @ApiOperation({ summary: 'Therapist fills their discipline section' })
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discipline') discipline: EicDiscipline,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: User,
  ) {
    return this.dischargeSvc.updateSection(id, discipline, body as any, actor.id);
  }

  @Post('discharge/:id/sections/:discipline/submit')
  @RequirePermissions('EIC:PROGRESS_REPORTS:CREATE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit discharge discipline section' })
  submitSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discipline') discipline: EicDiscipline,
    @CurrentUser() actor: User,
  ) {
    return this.dischargeSvc.submitSection(id, discipline, actor.id);
  }

  @Post('discharge/:id/sign')
  @RequirePermissions('EIC:DISCHARGE:SIGN')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_DISCHARGE_SIGN', module: 'EIC', entityType: 'eic_discharge_summaries' })
  @ApiOperation({ summary: 'Centre Head signs discharge summary' })
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { signatoryName: string; signatoryDesignation: string },
    @CurrentUser() actor: User,
  ) {
    return this.dischargeSvc.sign(id, actor.id, body.signatoryName, body.signatoryDesignation);
  }
}
