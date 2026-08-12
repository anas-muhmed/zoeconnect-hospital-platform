import {
  Controller, Get, Post, Body, Param, Query, Put,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EicPreschoolService } from './eic-preschool.service';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import { Audit }              from '../../../common/decorators/audit.decorator';
import type { User }          from '../../users/entities/user.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Preschool')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic/preschool')
export class EicPreschoolController {
  constructor(private readonly preschoolSvc: EicPreschoolService) {}

  // ── Enrollment ─────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions('EIC:PRESCHOOL:READ')
  @ApiOperation({ summary: 'List all preschool enrollments' })
  @ApiQuery({ name: 'q', required: false })
  findAll(@Query('q') q?: string) {
    return this.preschoolSvc.findAll(q);
  }

  @Post(':patientId/enroll')
  @RequirePermissions('EIC:PRESCHOOL:CREATE')
  @Audit({ action: 'EIC_PRESCHOOL_ENROLL', module: 'EIC', entityType: 'eic_preschool_enrollments' })
  @ApiOperation({ summary: 'Enroll patient in preschool section' })
  enroll(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: {
      admissionDate: string;
      classGroup?: string;
      teacherId?: string;
      teacherName?: string;
      notes?: string;
    },
    @CurrentUser() actor: User,
  ) {
    return this.preschoolSvc.enroll(patientId, body, actor.id);
  }

  @Get(':enrollId')
  @RequirePermissions('EIC:PRESCHOOL:READ')
  @ApiOperation({ summary: 'Get preschool enrollment by ID (includes current assessment)' })
  findById(@Param('enrollId', ParseUUIDPipe) enrollId: string) {
    return this.preschoolSvc.findById(enrollId);
  }

  // ── Assessment ─────────────────────────────────────────────────────────────

  @Post(':enrollId/assessment')
  @RequirePermissions('EIC:PRESCHOOL:CREATE')
  @Audit({ action: 'EIC_PRESCHOOL_ASSESSMENT_SAVE', module: 'EIC', entityType: 'eic_preschool_assessments' })
  @ApiOperation({ summary: 'Save / update the current preschool assessment' })
  saveAssessment(
    @Param('enrollId', ParseUUIDPipe) enrollId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: User,
  ) {
    return this.preschoolSvc.saveAssessment(enrollId, body as any, actor.id);
  }

  @Post(':enrollId/reassessment')
  @RequirePermissions('EIC:PRESCHOOL:CREATE')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'EIC_PRESCHOOL_REASSESSMENT_START', module: 'EIC', entityType: 'eic_preschool_assessments' })
  @ApiOperation({ summary: 'Archive current assessment and start a new re-assessment' })
  startReassessment(
    @Param('enrollId', ParseUUIDPipe) enrollId: string,
    @CurrentUser() actor: User,
  ) {
    return this.preschoolSvc.startReassessment(enrollId, actor.id);
  }

  @Get(':enrollId/assessment-history')
  @RequirePermissions('EIC:PRESCHOOL:READ')
  @ApiOperation({ summary: 'List all assessments (history) for an enrollment' })
  getAssessmentHistory(@Param('enrollId', ParseUUIDPipe) enrollId: string) {
    return this.preschoolSvc.getAssessmentHistory(enrollId);
  }

  // ── Daily Reports ───────────────────────────────────────────────────────────

  @Get(':enrollId/daily-reports')
  @RequirePermissions('EIC:PRESCHOOL:READ')
  @ApiOperation({ summary: 'List preschool daily reports' })
  @ApiQuery({ name: 'month', required: false, example: '2026-06' })
  getDailyReports(
    @Param('enrollId', ParseUUIDPipe) enrollId: string,
    @Query('month') month?: string,
  ) {
    return this.preschoolSvc.getDailyReports(enrollId, month);
  }

  @Post(':enrollId/daily-reports')
  @RequirePermissions('EIC:PRESCHOOL:CREATE')
  @Audit({ action: 'EIC_PRESCHOOL_DAILY_REPORT', module: 'EIC', entityType: 'eic_preschool_daily_reports' })
  @ApiOperation({ summary: 'Submit preschool daily report (enforces back-date limit)' })
  submitDailyReport(
    @Param('enrollId', ParseUUIDPipe) enrollId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: User,
  ) {
    return this.preschoolSvc.submitDailyReport(enrollId, body as any, actor.id);
  }

  // ── Settings (Superadmin) ───────────────────────────────────────────────────

  @Get('settings/backdate-limit')
  @RequirePermissions('PLATFORM:SETTINGS:READ')
  @ApiOperation({ summary: 'Get preschool daily report back-date limit (days)' })
  async getBackdateLimit() {
    const days = await this.preschoolSvc.getBackdateLimitDays();
    return { key: 'preschool.backdate_limit_days', value: days, unit: 'days' };
  }

  @Put('settings/backdate-limit')
  @RequirePermissions('PLATFORM:SETTINGS:UPDATE')
  @ApiOperation({ summary: 'Update preschool daily report back-date limit (superadmin only)' })
  async setBackdateLimit(
    @Body('days') days: number,
    @CurrentUser() actor: User,
  ) {
    await this.preschoolSvc.setBackdateLimitDays(days, actor.id);
    return { key: 'preschool.backdate_limit_days', value: days, unit: 'days', updatedBy: actor.id };
  }
}
