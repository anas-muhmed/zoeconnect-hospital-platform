import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CvTimetableService } from './cv-timetable.service';
import { CvTimetableLifecycleService } from './cv-timetable-lifecycle.service';
import { CvConflictEngineService } from './cv-conflict-engine.service';

const DAY_VALUES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export class CreateTimetableDto {
  @IsUUID()
  academicYearId: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}

export class AddPeriodDto {
  @IsIn(DAY_VALUES)
  dayOfWeek: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  teacherId: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;
}

export class UpdatePeriodDto {
  @IsOptional()
  @IsIn(DAY_VALUES)
  dayOfWeek?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;
}

export class PublishTimetableDto {
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CheckConflictsDto {
  @IsUUID()
  timetableId: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsIn(DAY_VALUES)
  dayOfWeek: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsUUID()
  teacherId: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsUUID()
  excludePeriodId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

/**
 * Timetable Management Phase 3 -- HTTP surface over the existing
 * `CvTimetableService` (period-level authoring/reads, extended in this
 * phase with `authorUpdatePeriod`/`removePeriod`) and the Phase 2
 * `CvTimetableLifecycleService` (version-level state machine). Mounted at
 * a NEW base path (`childrens-village/timetables`), distinct from the
 * existing `childrens-village/teacher-workspace` routes on
 * `CvTeacherWorkspaceController` -- that controller's three routes
 * (`GET schedule`, `GET schedule/week-overview`, `PATCH
 * schedule/periods/:id`) are untouched and keep using
 * `CvTimetableService.getTeacherScheduleForDate`/`updatePeriod` exactly as
 * before. No route paths overlap.
 */
@Controller('childrens-village/timetables')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('CHILDRENS_VILLAGE')
@UseInterceptors(TenantContextInterceptor)
export class CvTimetableController {
  constructor(
    private readonly timetableService: CvTimetableService,
    private readonly lifecycleService: CvTimetableLifecycleService,
    private readonly conflictEngine: CvConflictEngineService,
  ) {}

  // ── Versions ───────────────────────────────────────────────────────

  @Get('classes/:classId')
  @RequirePermissions('CV:TIMETABLE:READ')
  async listVersionsForClass(
    @Param('classId') classId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('termId') termId?: string,
  ) {
    if (!academicYearId) throw new BadRequestException('academicYearId query parameter is required');
    return this.lifecycleService.listVersions(classId, academicYearId, termId ?? null);
  }

  @Get('classes/:classId/active')
  @RequirePermissions('CV:TIMETABLE:READ')
  async getActiveForClass(
    @Param('classId') classId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('termId') termId?: string,
  ) {
    if (!academicYearId) throw new BadRequestException('academicYearId query parameter is required');
    return this.lifecycleService.getActiveVersion(classId, academicYearId, termId ?? null);
  }

  @Post('classes/:classId')
  @RequirePermissions('CV:TIMETABLE:CREATE')
  async createDraft(
    @Param('classId') classId: string,
    @Body() dto: CreateTimetableDto,
    @Request() req: any,
  ) {
    return this.timetableService.createTimetable(req.user.userId, classId, dto.academicYearId, dto.termId);
  }

  @Get(':id')
  @RequirePermissions('CV:TIMETABLE:READ')
  async getVersion(@Param('id') id: string) {
    const timetable = await this.lifecycleService.findByIdOrThrow(id);
    const periods = await this.lifecycleService.listPeriods(id);
    return { ...timetable, periods };
  }

  @Get(':id/compare')
  @RequirePermissions('CV:TIMETABLE:READ')
  async compare(@Param('id') id: string, @Query('otherId') otherId: string) {
    if (!otherId) throw new BadRequestException('otherId query parameter is required');
    return this.lifecycleService.compareVersions(id, otherId);
  }

  // ── Conflict Engine (Phase 4 -- report-only, never blocks) ─────────

  /**
   * Dry-run conflict check -- no write happens here. The authoring UI is
   * expected to call this before submitting a period, and to also read
   * the `conflictWarnings` this controller now attaches to `addPeriod`/
   * `updatePeriod` responses (see below). Per the phase scope, this never
   * throws for a detected conflict, regardless of severity -- it only
   * reports.
   */
  @Post('conflicts/check')
  @RequirePermissions('CV:TIMETABLE:READ')
  async checkConflicts(@Body() dto: CheckConflictsDto) {
    return this.conflictEngine.checkAll(
      {
        timetableId: dto.timetableId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        teacherId: dto.teacherId,
        resourceId: dto.resourceId,
        excludePeriodId: dto.excludePeriodId,
      },
      dto.date,
    );
  }

  // ── Periods (draft-only authoring) ────────────────────────────────

  @Post(':id/periods')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async addPeriod(@Param('id') id: string, @Body() dto: AddPeriodDto, @Request() req: any) {
    const timetable = await this.lifecycleService.findByIdOrThrow(id);
    if (timetable.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot add a period to a '${timetable.status}' timetable -- clone it into a new draft first`);
    }
    const saved = await this.timetableService.addPeriod(req.user.userId, id, dto);

    // Report-only: conflicts are surfaced alongside the successful write,
    // never in place of it. See CvConflictEngineService's class doc.
    const report = await this.conflictEngine.checkAll({
      timetableId: id,
      classId: timetable.classId,
      subjectId: saved.subjectId,
      dayOfWeek: saved.dayOfWeek,
      startTime: saved.startTime,
      endTime: saved.endTime,
      teacherId: saved.teacherId,
      resourceId: saved.resourceId,
      excludePeriodId: saved.id,
    });

    return { ...saved, conflictWarnings: report.conflicts };
  }

  @Patch(':id/periods/:periodId')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async updatePeriod(
    @Param('id') timetableId: string,
    @Param('periodId') periodId: string,
    @Body() dto: UpdatePeriodDto,
    @Request() req: any,
  ) {
    const saved = await this.timetableService.authorUpdatePeriod(req.user.userId, periodId, dto);

    const report = await this.conflictEngine.checkAll({
      timetableId,
      subjectId: saved.subjectId,
      dayOfWeek: saved.dayOfWeek,
      startTime: saved.startTime,
      endTime: saved.endTime,
      teacherId: saved.teacherId,
      resourceId: saved.resourceId,
      excludePeriodId: saved.id,
    });

    return { ...saved, conflictWarnings: report.conflicts };
  }

  @Delete(':id/periods/:periodId')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async removePeriod(@Param('periodId') periodId: string, @Request() req: any) {
    await this.timetableService.removePeriod(req.user.userId, periodId);
    return { success: true };
  }

  // ── Lifecycle transitions ─────────────────────────────────────────

  @Post(':id/submit-review')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async submitForReview(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.submitForReview(req.user.userId, id);
  }

  @Post(':id/return-to-draft')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async returnToDraft(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.lifecycleService.returnToDraft(req.user.userId, id, dto.reason);
  }

  @Post(':id/publish')
  @RequirePermissions('CV:TIMETABLE:PUBLISH')
  async publish(@Param('id') id: string, @Body() dto: PublishTimetableDto, @Request() req: any) {
    return this.lifecycleService.publish(req.user.userId, id, dto.effectiveFrom);
  }

  @Post(':id/activate')
  @RequirePermissions('CV:TIMETABLE:PUBLISH')
  async activate(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.activateIfEffective(req.user.userId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('CV:TIMETABLE:ARCHIVE')
  async archive(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.archive(req.user.userId, id);
  }

  @Post(':id/suspend')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async suspend(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.lifecycleService.suspend(req.user.userId, id, dto.reason);
  }

  @Post(':id/resume')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async resume(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.resume(req.user.userId, id);
  }

  @Post(':id/clone')
  @RequirePermissions('CV:TIMETABLE:UPDATE')
  async clone(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.cloneForEdit(req.user.userId, id);
  }

  @Post(':id/rollback')
  @RequirePermissions('CV:TIMETABLE:ARCHIVE')
  async rollback(@Param('id') id: string, @Request() req: any) {
    return this.lifecycleService.rollback(req.user.userId, id);
  }
}
