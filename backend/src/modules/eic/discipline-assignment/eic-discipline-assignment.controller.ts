import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EicDisciplineAssignmentService } from './eic-discipline-assignment.service';
import { CreateDisciplineAssignmentDto } from './dto/create-discipline-assignment.dto';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import type { User }          from '../../users/entities/user.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Discipline Assignments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic/enrollments/:enrollmentId/discipline-assignments')
export class EicDisciplineAssignmentController {
  constructor(private readonly svc: EicDisciplineAssignmentService) {}

  @Post()
  @RequirePermissions('EIC:DISCIPLINE_ASSIGNMENTS:CREATE')
  @ApiOperation({ summary: 'Assign a therapist to a discipline for this enrollment' })
  create(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CreateDisciplineAssignmentDto,
    @CurrentUser() actor: User,
  ) {
    return this.svc.create(enrollmentId, dto, actor.id);
  }

  @Get()
  @RequirePermissions('EIC:DISCIPLINE_ASSIGNMENTS:READ')
  @ApiOperation({ summary: 'List all assignments for enrollment (full history)' })
  findAll(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.svc.findByEnrollment(enrollmentId);
  }

  @Get('active')
  @RequirePermissions('EIC:DISCIPLINE_ASSIGNMENTS:READ')
  @ApiOperation({ summary: 'List only currently active assignments for enrollment' })
  findActive(@Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.svc.findActiveByEnrollment(enrollmentId);
  }

  @Patch(':assignmentId/close')
  @RequirePermissions('EIC:DISCIPLINE_ASSIGNMENTS:CREATE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close (deactivate) an assignment — sets effective_to date' })
  close(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: { effectiveTo: string },
  ) {
    return this.svc.close(enrollmentId, assignmentId, body.effectiveTo);
  }
}
