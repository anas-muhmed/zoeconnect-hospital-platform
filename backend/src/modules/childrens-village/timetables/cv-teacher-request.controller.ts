import { Body, Controller, Get, Param, Post, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvTeacherRequestService } from './cv-teacher-request.service';

class CreateExchangeBodyDto {
  @IsUUID() periodId: string;
  @IsDateString() date: string;
  @IsUUID() proposedTeacherId: string;
  @IsOptional() @IsString() reason?: string;
}

class CreateSwapBodyDto {
  @IsUUID() periodId: string;
  @IsUUID() counterpartyPeriodId: string;
  @IsDateString() date: string;
  @IsOptional() @IsString() reason?: string;
}

class CreateSubstituteBodyDto {
  @IsUUID() periodId: string;
  @IsUUID() substituteTeacherId: string;
  @IsDateString() dateStart: string;
  @IsOptional() @IsDateString() dateEnd?: string;
  @IsOptional() @IsString() reason?: string;
}

class RespondBodyDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  decision: 'ACCEPT' | 'DECLINE';
  @IsOptional() @IsString() reason?: string;
}

class RollbackBodyDto {
  @IsString() @IsNotEmpty() reason: string;
}

/**
 * Timetable Management Phase 7 -- HTTP surface over `CvTeacherRequestService`.
 *
 * Exchange/swap creation and counterparty response carry no
 * `@RequirePermissions` -- ownership (period.teacherId === caller,
 * counterparty === caller) is enforced inside the service, matching the
 * live `CvTeacherWorkspaceController.updatePeriod`'s established pattern
 * for self-service teacher actions. Substitute-assignment creation and
 * rollback ARE gated, by the new `CV:TEACHER_REQUEST:MANAGE` permission
 * (Phase 7 migration) -- both are admin/coordinator actions per design
 * spec Section 2.5's "Admin/Head Teacher/Coordinator reviews".
 */
@Controller('childrens-village/teacher-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTeacherRequestController {
  constructor(private readonly requestService: CvTeacherRequestService) {}

  @Get('my')
  async listMine(@Request() req: any) {
    return this.requestService.listForTeacher(req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.requestService.findByIdOrThrow(id);
  }

  @Post('exchange')
  async createExchange(@Body() dto: CreateExchangeBodyDto, @Request() req: any) {
    return this.requestService.createExchangeRequest(req.user.userId, dto);
  }

  @Post('swap')
  async createSwap(@Body() dto: CreateSwapBodyDto, @Request() req: any) {
    return this.requestService.createSwapRequest(req.user.userId, dto);
  }

  @Post('substitute')
  @RequirePermissions('CV:TEACHER_REQUEST:MANAGE')
  async createSubstitute(@Body() dto: CreateSubstituteBodyDto, @Request() req: any) {
    return this.requestService.createSubstituteRequest(req.user.userId, dto);
  }

  @Post(':id/respond')
  async respond(@Param('id') id: string, @Body() dto: RespondBodyDto, @Request() req: any) {
    return this.requestService.respondToCounterparty(req.user.userId, id, dto.decision === 'ACCEPT', dto.reason);
  }

  @Post(':id/rollback')
  @RequirePermissions('CV:TEACHER_REQUEST:MANAGE')
  async rollback(@Param('id') id: string, @Body() dto: RollbackBodyDto, @Request() req: any) {
    return this.requestService.rollback(req.user.userId, id, dto.reason);
  }
}
