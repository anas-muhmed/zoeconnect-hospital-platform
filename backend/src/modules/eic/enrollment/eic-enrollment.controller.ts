import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EicEnrollmentService } from './eic-enrollment.service';
import { CreateEicEnrollmentDto, AssignTherapistDto } from './dto/create-enrollment.dto';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { Audit }              from '../../../common/decorators/audit.decorator';
import type { User }          from '../../users/entities/user.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Enrollments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic/enrollments')
export class EicEnrollmentController {
  constructor(private readonly enrollmentSvc: EicEnrollmentService) {}

  @Post()
  @RequirePermissions('EIC:ENROLLMENTS:CREATE')
  @Audit({ action: 'EIC_ENROLLMENT_CREATE', module: 'EIC', entityType: 'eic_therapy_enrollments' })
  @ApiOperation({ summary: 'Admit patient to EIC (create enrollment)' })
  create(
    @Body() dto: CreateEicEnrollmentDto,
    @CurrentUser() actor: User,
    @ActiveBranchId() branchId: string,
  ) {
    return this.enrollmentSvc.create(dto, actor.id, branchId);
  }

  @Get(':id')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Get enrollment by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentSvc.findById(id);
  }

  @Get(':id/team')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Get active therapy team for enrollment' })
  getTeam(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentSvc.getTeam(id);
  }

  @Post(':id/team')
  @RequirePermissions('EIC:ENROLLMENTS:CREATE')
  @Audit({ action: 'EIC_THERAPIST_ASSIGN', module: 'EIC', entityType: 'eic_therapy_team_members' })
  @ApiOperation({ summary: 'Assign a therapist to a discipline within the enrollment' })
  assignTherapist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTherapistDto,
    @CurrentUser() actor: User,
  ) {
    return this.enrollmentSvc.assignTherapist(id, dto, actor.id);
  }

  @Delete(':id/team/:memberId')
  @RequirePermissions('EIC:ENROLLMENTS:CREATE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a therapist from the team' })
  removeTherapist(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() actor: User,
  ) {
    return this.enrollmentSvc.removeTherapist(id, memberId, actor.id);
  }
}
