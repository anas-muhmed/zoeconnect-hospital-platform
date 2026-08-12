import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EicGoalService, CreateGoalDto } from './eic-goal.service';
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

@ApiTags('EIC — Goals')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic')
export class EicGoalController {
  constructor(private readonly goalSvc: EicGoalService) {}

  @Post('enrollments/:enrollmentId/goals')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @Audit({ action: 'EIC_GOAL_CREATE', module: 'EIC', entityType: 'eic_goals' })
  @ApiOperation({ summary: 'Add a therapy goal to an enrollment' })
  create(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CreateGoalDto,
    @CurrentUser() actor: User,
  ) {
    return this.goalSvc.create(enrollmentId, dto, actor.id);
  }

  @Get('enrollments/:enrollmentId/goals')
  @RequirePermissions('EIC:SESSIONS:READ')
  @ApiOperation({ summary: 'List all goals for an enrollment' })
  @ApiQuery({ name: 'discipline', enum: EicDiscipline, required: false })
  findByEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query('discipline') discipline?: EicDiscipline,
  ) {
    return this.goalSvc.findByEnrollment(enrollmentId, discipline);
  }

  @Patch('goals/:id')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @ApiOperation({ summary: 'Update goal text or target date' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { goalText?: string; targetDate?: string; displayOrder?: number },
    @CurrentUser() actor: User,
  ) {
    return this.goalSvc.update(id, body, actor.id);
  }

  @Post('goals/:id/achieve')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_GOAL_ACHIEVE', module: 'EIC', entityType: 'eic_goals' })
  @ApiOperation({ summary: 'Mark goal as achieved' })
  achieve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() actor: User,
  ) {
    return this.goalSvc.achieve(id, notes, actor.id);
  }

  @Post('goals/:id/extend')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_GOAL_EXTEND', module: 'EIC', entityType: 'eic_goals' })
  @ApiOperation({ summary: 'Extend a goal target date with a reason' })
  extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { newTargetDate: string; remarks: string },
    @CurrentUser() actor: User,
  ) {
    return this.goalSvc.extend(id, body.newTargetDate, body.remarks, actor.id);
  }

  @Post('goals/:id/discontinue')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discontinue a goal' })
  discontinue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.goalSvc.discontinue(id, actor.id);
  }
}
