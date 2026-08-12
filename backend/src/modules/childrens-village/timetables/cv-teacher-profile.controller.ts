import { Controller, Get, Put, Body, Param, UseGuards, UseInterceptors, Request } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvTeacherProfileService } from './cv-teacher-profile.service';
import { CvConflictEngineService } from './cv-conflict-engine.service';

export class UpsertTeacherProfileBodyDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  subjectsQualified?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPeriodsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPeriodsPerWeek?: number;

  @IsOptional()
  @IsBoolean()
  isSubstituteEligible?: boolean;
}

/**
 * Timetable Management Phase 5 -- HTTP surface over the Phase 1
 * `CvTeacherProfileService` (which had no controller until now) plus the
 * Phase 5 `CvConflictEngineService.getTeacherWorkloadSummary` read.
 *
 * Gated entirely by `CV:TEACHER_PROFILE:MANAGE` (the only permission
 * seeded for this resource in the Phase 1 migration) -- there is no
 * separate `CV:TEACHER_PROFILE:READ` permission today, so read and write
 * routes here share the same gate. Broadening this to a dedicated read
 * permission (e.g. so a teacher could view their own profile/workload
 * without full MANAGE rights) is a real gap worth closing, but it's an
 * RBAC/permission-seeding decision, not something to make unilaterally in
 * this phase -- flagged in the phase report rather than done silently.
 */
@Controller('childrens-village/teacher-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTeacherProfileController {
  constructor(
    private readonly profileService: CvTeacherProfileService,
    private readonly conflictEngine: CvConflictEngineService,
  ) {}

  @Get()
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async findAll() {
    return this.profileService.findAll();
  }

  @Get(':userId')
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async findByUserId(@Param('userId') userId: string) {
    return this.profileService.findByUserId(userId);
  }

  @Get(':userId/workload')
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async getWorkload(@Param('userId') userId: string) {
    return this.conflictEngine.getTeacherWorkloadSummary(userId);
  }

  @Put(':userId')
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async upsert(@Param('userId') userId: string, @Body() dto: UpsertTeacherProfileBodyDto, @Request() req: any) {
    return this.profileService.upsertForUser({ ...dto, userId }, req.user.userId);
  }
}
