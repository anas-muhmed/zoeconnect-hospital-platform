import { Body, Controller, Get, Param, Post, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvTimetableWorkflowService } from './cv-timetable-workflow.service';
import type { WorkflowDefinition } from '../../document-platform/workflow-engine/models/workflow-definition';

class CreateTemplateBodyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  changeType: string;

  @IsObject()
  definition: WorkflowDefinition;
}

class CompleteTaskBodyDto {
  @IsIn(['APPROVED', 'REJECTED'])
  outcome: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  comment?: string;
}

class EmergencyOverrideBodyDto {
  @IsString()
  @IsNotEmpty()
  justification: string;
}

/**
 * Timetable Management Phase 6 -- HTTP surface over `CvTimetableWorkflowService`.
 *
 * Template management (create/publish/list) is gated by
 * `CV:TIMETABLE_SETTINGS:MANAGE` (the same permission Phase 1 seeded for
 * configuring approval/conflict settings) -- admin-only, matching the
 * design spec's treatment of workflow templates as tenant configuration,
 * not day-to-day operational data.
 *
 * Task completion (`POST tasks/:id/complete`) deliberately carries no
 * `@RequirePermissions` of its own: `CvTimetableWorkflowService.completeTask`
 * already enforces "you must be the assigned user, or hold
 * `CV:TIMETABLE:APPROVE` for an ADMIN-pool task" internally. Gating the
 * route itself with `CV:TIMETABLE:APPROVE` would lock out a
 * `CLASS_TEACHER_OF_RECORD` assignee who was never granted that
 * permission -- per the user's own decision to resolve approvers via
 * `CvClass.classTeacherId`/user attributes rather than a fixed
 * Principal/Head-Teacher role tier, an assignee is not necessarily an
 * "approver" in the permission-matrix sense.
 */
@Controller('childrens-village/timetable-workflows')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTimetableWorkflowController {
  constructor(private readonly workflowService: CvTimetableWorkflowService) {}

  // ── Templates ──────────────────────────────────────────────────────

  @Post('templates')
  @RequirePermissions('CV:TIMETABLE_SETTINGS:MANAGE')
  async createTemplate(@Body() dto: CreateTemplateBodyDto, @Request() req: any) {
    return this.workflowService.createTemplate(dto, req.user.userId);
  }

  @Post('templates/:id/publish')
  @RequirePermissions('CV:TIMETABLE_SETTINGS:MANAGE')
  async publishTemplate(@Param('id') id: string, @Request() req: any) {
    return this.workflowService.publishTemplate(req.user.userId, id);
  }

  @Get('templates')
  @RequirePermissions('CV:TIMETABLE_SETTINGS:MANAGE')
  async listTemplates(@Query('changeType') changeType?: string) {
    return this.workflowService.listTemplates(changeType);
  }

  // ── Tasks ──────────────────────────────────────────────────────────

  @Get('tasks/my')
  async listMyTasks(@Request() req: any) {
    return this.workflowService.listPendingTasksForUser(req.user.userId);
  }

  @Get('tasks/admin')
  @RequirePermissions('CV:TIMETABLE:APPROVE')
  async listAdminTasks() {
    return this.workflowService.listPendingAdminTasks();
  }

  @Post('tasks/:id/complete')
  async completeTask(@Param('id') id: string, @Body() dto: CompleteTaskBodyDto, @Request() req: any) {
    const actorIsAdmin = Boolean(req.user.isSuperAdmin) || (typeof req.user.hasPermission === 'function' && req.user.hasPermission('CV:TIMETABLE:APPROVE'));
    return this.workflowService.completeTask(req.user.userId, id, dto.outcome, actorIsAdmin, dto.comment);
  }

  // ── Emergency override / escalation ───────────────────────────────

  @Post('instances/:id/emergency-override')
  @RequirePermissions('CV:TIMETABLE:EMERGENCY_OVERRIDE')
  async emergencyOverride(@Param('id') id: string, @Body() dto: EmergencyOverrideBodyDto, @Request() req: any) {
    return this.workflowService.emergencyOverride(req.user.userId, id, dto.justification);
  }

  @Post('tasks/check-overdue')
  @RequirePermissions('CV:TIMETABLE:APPROVE')
  async checkOverdueTasks() {
    return this.workflowService.checkOverdueTasks();
  }
}
