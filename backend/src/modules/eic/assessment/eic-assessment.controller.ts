import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EicAssessmentService, CreateAssessmentDto, UpdateAssessmentDto } from './eic-assessment.service';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import { Audit }              from '../../../common/decorators/audit.decorator';
import type { User }          from '../../users/entities/user.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Assessments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic')
export class EicAssessmentController {
  constructor(private readonly assessmentSvc: EicAssessmentService) {}

  @Post('enrollments/:enrollmentId/assessments')
  @RequirePermissions('EIC:ASSESSMENTS:CREATE')
  @Audit({ action: 'EIC_ASSESSMENT_CREATE', module: 'EIC', entityType: 'eic_assessments' })
  @ApiOperation({ summary: 'Create a new assessment for an enrollment' })
  create(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CreateAssessmentDto,
    @CurrentUser() actor: User,
  ) {
    return this.assessmentSvc.create(enrollmentId, dto, actor.id);
  }

  @Get('enrollments/:enrollmentId/assessments')
  @RequirePermissions('EIC:ASSESSMENTS:READ')
  @ApiOperation({ summary: 'List all assessments for an enrollment' })
  findByEnrollment(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.assessmentSvc.findByEnrollment(enrollmentId);
  }

  /** Cross-enrollment countersign queue — SUBMITTED + UNDER_REVIEW */
  @Get('assessments')
  @RequirePermissions('EIC:ASSESSMENTS:READ')
  @ApiOperation({ summary: 'List assessments awaiting countersign (SUBMITTED / UNDER_REVIEW)' })
  findAwaitingReview() {
    return this.assessmentSvc.findAwaitingReview();
  }

  @Get('assessments/:id')
  @RequirePermissions('EIC:ASSESSMENTS:READ')
  @ApiOperation({ summary: 'Get assessment details' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.assessmentSvc.findById(id);
  }

  @Patch('assessments/:id')
  @RequirePermissions('EIC:ASSESSMENTS:CREATE')
  @ApiOperation({ summary: 'Update assessment clinical data (draft only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser() actor: User,
  ) {
    return this.assessmentSvc.update(id, dto, actor.hisEmployeeCode!);
  }

  @Post('assessments/:id/submit')
  @RequirePermissions('EIC:ASSESSMENTS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_ASSESSMENT_SUBMIT', module: 'EIC', entityType: 'eic_assessments' })
  @ApiOperation({ summary: 'Submit assessment for Centre Head review' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.assessmentSvc.submit(id, actor.hisEmployeeCode!);
  }

  @Post('assessments/:id/countersign')
  @RequirePermissions('EIC:ASSESSMENTS:COUNTERSIGN')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_ASSESSMENT_COUNTERSIGN', module: 'EIC', entityType: 'eic_assessments' })
  @ApiOperation({ summary: 'Centre Head countersigns (finalises) an assessment' })
  countersign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() actor: User,
  ) {
    return this.assessmentSvc.countersign(id, actor.id, notes);
  }

  @Post('assessments/:id/reassess')
  @RequirePermissions('EIC:ASSESSMENTS:CREATE')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'EIC_ASSESSMENT_REASSESS', module: 'EIC', entityType: 'eic_assessments' })
  @ApiOperation({ summary: 'Start a reassessment from a finalised therapy assessment' })
  reassess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { therapistId: string; therapistName: string },
    @CurrentUser() actor: User,
  ) {
    return this.assessmentSvc.reassess(id, dto, actor.id);
  }

  @Post('assessments/:id/request-revision')
  @RequirePermissions('EIC:ASSESSMENTS:COUNTERSIGN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Centre Head requests revision of a submitted assessment' })
  requestRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() actor: User,
  ) {
    return this.assessmentSvc.requestRevision(id, actor.id, notes);
  }
}
