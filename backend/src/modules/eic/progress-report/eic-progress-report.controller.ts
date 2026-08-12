import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EicProgressReportService } from './eic-progress-report.service';
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

@ApiTags('EIC — Progress Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic')
export class EicProgressReportController {
  constructor(private readonly reportSvc: EicProgressReportService) {}

  @Post('enrollments/:enrollmentId/progress-reports')
  @RequirePermissions('EIC:PROGRESS_REPORTS:CREATE')
  @Audit({ action: 'EIC_PROGRESS_REPORT_INITIATE', module: 'EIC', entityType: 'eic_progress_reports' })
  @ApiOperation({ summary: 'Initiate a new progress report for any period (3M, 6M, annual, custom)' })
  initiate(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() body: { periodFrom: string; periodTo: string; disciplines: EicDiscipline[] },
    @CurrentUser() actor: User,
  ) {
    return this.reportSvc.initiate(
      enrollmentId, body.periodFrom, body.periodTo, body.disciplines, actor.id,
    );
  }

  /**
   * Cross-enrollment work queue — returns reports relevant to the current user.
   *
   * ?view=MY_SECTIONS        Therapist inbox: reports with sections assigned to me (not yet SIGNED)
   * ?view=PENDING_SIGNATURE  Centre Head queue: all reports awaiting signature
   * ?view=ALL                Admin: every report in the system
   */
  @Get('progress-reports')
  @RequirePermissions('EIC:PROGRESS_REPORTS:READ')
  @ApiOperation({ summary: 'Cross-enrollment work queue — role-aware report list' })
  findWorkQueue(
    @Query('view') view: 'MY_SECTIONS' | 'PENDING_SIGNATURE' | 'ALL' = 'ALL',
    @Query('limit') limit = '100',
    @Query('offset') offset = '0',
    @CurrentUser() actor: User,
  ) {
    return this.reportSvc.findWorkQueue(view, actor.id, Number(limit), Number(offset));
  }

  @Get('enrollments/:enrollmentId/progress-reports')
  @RequirePermissions('EIC:PROGRESS_REPORTS:READ')
  @ApiOperation({ summary: 'List all progress reports for enrollment' })
  findByEnrollment(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.reportSvc.findByEnrollment(enrollmentId);
  }

  @Get('progress-reports/:id')
  @RequirePermissions('EIC:PROGRESS_REPORTS:READ')
  @ApiOperation({ summary: 'Get full progress report with all sections' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportSvc.findById(id);
  }

  @Patch('progress-reports/:id/sections/:discipline')
  @RequirePermissions('EIC:PROGRESS_REPORTS:CREATE')
  @ApiOperation({ summary: 'Update a discipline section of the report' })
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discipline') discipline: EicDiscipline,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: User,
  ) {
    return this.reportSvc.updateSection(id, discipline, body as any, actor.id);
  }

  @Post('progress-reports/:id/sections/:discipline/submit')
  @RequirePermissions('EIC:PROGRESS_REPORTS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_PROGRESS_SECTION_SUBMIT', module: 'EIC', entityType: 'eic_discipline_progress_sections' })
  @ApiOperation({ summary: 'Submit a discipline section' })
  submitSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discipline') discipline: EicDiscipline,
    @CurrentUser() actor: User,
  ) {
    return this.reportSvc.submitSection(id, discipline, actor.id);
  }

  @Post('progress-reports/:id/sign')
  @RequirePermissions('EIC:PROGRESS_REPORTS:SIGN')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_PROGRESS_REPORT_SIGN', module: 'EIC', entityType: 'eic_progress_reports' })
  @ApiOperation({ summary: 'Centre Head signs progress report' })
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { signatoryName: string; signatoryDesignation: string },
    @CurrentUser() actor: User,
  ) {
    return this.reportSvc.sign(id, actor.id, body.signatoryName, body.signatoryDesignation);
  }
}
