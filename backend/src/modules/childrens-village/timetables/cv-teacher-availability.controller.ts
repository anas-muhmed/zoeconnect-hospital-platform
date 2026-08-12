import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, Request, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvTeacherAvailabilityService, CreateTeacherAvailabilityDto } from './cv-teacher-availability.service';

/**
 * Timetable Management Phase 5 -- HTTP surface over the Phase 1
 * `CvTeacherAvailabilityService` (which had no controller until now).
 *
 * Reads are gated by the dedicated `CV:TEACHER_AVAILABILITY:READ`
 * permission (seeded in Phase 1); writes by `CV:TEACHER_AVAILABILITY:MANAGE`.
 * Both are currently seeded only to SUPER_ADMIN/HOSPITAL_ADMIN -- there is
 * no self-service "a teacher records their own absence" path yet, since
 * that would need either a TEACHER role (not confirmed to exist as a
 * fixed platform role, per the design spec's own risk note) granted this
 * permission, or an ownership-based bypass like `CvTimetableService
 * .updatePeriod`'s pattern. Left as an explicit open item in the phase
 * report rather than decided here.
 */
@Controller('childrens-village/teacher-availability')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTeacherAvailabilityController {
  constructor(private readonly service: CvTeacherAvailabilityService) {}

  @Get()
  @RequirePermissions('CV:TEACHER_AVAILABILITY:READ')
  async list(
    @Query('teacherId') teacherId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!teacherId) throw new BadRequestException('teacherId query parameter is required');
    return this.service.listForTeacher(teacherId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Post()
  @RequirePermissions('CV:TEACHER_AVAILABILITY:MANAGE')
  async create(@Body() dto: CreateTeacherAvailabilityDto, @Request() req: any) {
    return this.service.create(dto, req.user.userId);
  }

  @Delete(':id')
  @RequirePermissions('CV:TEACHER_AVAILABILITY:MANAGE')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.service.remove(id, req.user.userId);
    return { success: true };
  }
}
