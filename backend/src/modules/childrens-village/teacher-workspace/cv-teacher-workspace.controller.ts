import {
  Controller, Get, Post, Patch, Body, Param, Query, UseInterceptors, UseGuards, Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { FastifyRequest } from 'fastify';

import { CvTimetableService } from '../timetables/cv-timetable.service';
import { CvAttendanceService } from '../attendance/cv-attendance.service';
import { CvDailyLearningRecordService } from '../learning-records/cv-daily-learning-record.service';
import { CvClassService } from '../classes/cv-class.service';

// NOTE: previously '@Controller('api/childrens-village/teacher-workspace')' --
// duplicated the app's global 'api' prefix (see main.ts `setGlobalPrefix`),
// resolving to the unreachable /api/v1/api/childrens-village/... . Nothing
// live ever called this controller (the frontend teacher-workspace page was
// static mock data), so the bug was silent. Fixed to match every sibling CV
// controller's route shape.
@Controller('childrens-village/teacher-workspace')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTeacherWorkspaceController {
  constructor(
    private readonly timetableService: CvTimetableService,
    private readonly attendanceService: CvAttendanceService,
    private readonly dlrService: CvDailyLearningRecordService,
    private readonly classService: CvClassService,
  ) {}

  /**
   * Real student roster for the logged-in teacher's own classes (2026-08-03
   * fix) -- replaces the Teacher Workspace page's hardcoded "Leo M." /
   * "Mia T." dropdown options, which never reflected actual admissions.
   * See `CvClassService.getRosterForTeacher()` for how "this teacher's
   * classes" is resolved.
   */
  @Get('roster')
  async getRoster(@Req() req: FastifyRequest & { user: any }) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.classService.getRosterForTeacher(actorId);
  }

  /**
   * The logged-in teacher's schedule for a given date (defaults to today).
   * Merges regular periods, student pull-out overrides, and EIC therapy
   * sessions -- same aggregation `getTeacherScheduleForDay` always did, now
   * driven by a real date instead of a hardcoded MONDAY.
   */
  @Get('schedule')
  async getMySchedule(@Req() req: FastifyRequest & { user: any }, @Query('date') date?: string) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    const targetDate = date ? new Date(date) : new Date();
    return this.timetableService.getTeacherScheduleForDate(actorId, targetDate);
  }

  /** Period counts per weekday for the logged-in teacher, for a week-at-a-glance strip. */
  @Get('schedule/week-overview')
  async getWeekOverview(@Req() req: FastifyRequest & { user: any }) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.timetableService.getTeacherWeekOverview(actorId);
  }

  /**
   * Inline-edit a period on the teacher's own timetable. `date` is the day
   * the caller was viewing when they made the edit -- rejected server-side
   * (not just hidden client-side) if it's before today. `scope` decides
   * whether this changes just that one date ('THIS_DAY', stored as a
   * single-date override) or every future occurrence of that weekday
   * ('ALL_FUTURE', the default -- edits the recurring template directly).
   * No fine-grained permission gate here, matching `attendance/bulk` and
   * `learning-records` below: ownership (period.teacherId === caller) is
   * the real boundary, enforced in the service, not a seeded RBAC permission
   * a teacher role would need to be granted.
   */
  @Patch('schedule/periods/:id')
  async updatePeriod(
    @Req() req: FastifyRequest & { user: any },
    @Param('id') id: string,
    @Body() body: {
      date?: string;
      scope?: 'THIS_DAY' | 'ALL_FUTURE';
      room?: string | null;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.timetableService.updatePeriod(actorId, id, body);
  }

  @Post('attendance/bulk')
  async markBulkAttendance(@Req() req: FastifyRequest & { user: any }, @Body() data: any[]) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.attendanceService.markAttendance(actorId, data);
  }

  @Post('learning-records')
  async submitLearningRecord(@Req() req: FastifyRequest & { user: any }, @Body() data: any) {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.dlrService.submitRecord(actorId, data);
  }
}
