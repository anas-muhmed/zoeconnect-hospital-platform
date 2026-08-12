import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, Request, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvClassSubjectTeacherService, AssignSubjectTeacherDto } from './cv-class-subject-teacher.service';

/**
 * Timetable Management Phase 5 -- HTTP surface over the Phase 1
 * `CvClassSubjectTeacherService` (which had no controller until now). This
 * is the "subject-teacher roster" the Conflict Engine's
 * `checkClassSubjectAssignment` (Phase 5) reads from.
 *
 * Gated by `CV:TEACHER_PROFILE:MANAGE` -- no dedicated permission was
 * seeded for `cv_class_subject_teachers` specifically in Phase 1, and this
 * is squarely the same "who's allowed to configure teacher assignments"
 * capability domain, so reusing that permission is the closest fit rather
 * than inventing an unseeded string that would silently deny everyone
 * until a follow-up migration grants it.
 */
@Controller('childrens-village/class-subject-teachers')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvClassSubjectTeacherController {
  constructor(private readonly service: CvClassSubjectTeacherService) {}

  @Get()
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async list(
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    if (classId) return this.service.listForClass(classId, academicYearId);
    if (teacherId) return this.service.listForTeacher(teacherId);
    throw new BadRequestException('classId or teacherId query parameter is required');
  }

  @Post()
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async assign(@Body() dto: AssignSubjectTeacherDto, @Request() req: any) {
    return this.service.assign(dto, req.user.userId);
  }

  @Delete(':id')
  @RequirePermissions('CV:TEACHER_PROFILE:MANAGE')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.service.remove(id, req.user.userId);
    return { success: true };
  }
}
