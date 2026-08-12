import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EicSessionService, CreateSessionDto, AddSessionEntryDto } from './eic-session.service';
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

@ApiTags('EIC — Sessions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic')
export class EicSessionController {
  constructor(private readonly sessionSvc: EicSessionService) {}

  @Post('enrollments/:enrollmentId/sessions')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @Audit({ action: 'EIC_SESSION_CREATE', module: 'EIC', entityType: 'eic_therapy_sessions' })
  @ApiOperation({ summary: 'Create a new therapy session' })
  create(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CreateSessionDto,
    @CurrentUser() actor: User,
  ) {
    return this.sessionSvc.create(enrollmentId, dto, actor.id);
  }

  @Get('enrollments/:enrollmentId/sessions')
  @RequirePermissions('EIC:SESSIONS:READ')
  @ApiOperation({ summary: 'List sessions for an enrollment' })
  @ApiQuery({ name: 'discipline', enum: EicDiscipline, required: false })
  @ApiQuery({ name: 'date', required: false })
  findByEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query('discipline') discipline?: EicDiscipline,
    @Query('date') date?: string,
  ) {
    return this.sessionSvc.findByEnrollment(enrollmentId, discipline, date);
  }

  /** Daily hub — all sessions across enrollments for a given date */
  @Get('sessions')
  @RequirePermissions('EIC:SESSIONS:READ')
  @ApiOperation({ summary: 'List all sessions for a date (daily hub)' })
  @ApiQuery({ name: 'date', required: true })
  @ApiQuery({ name: 'discipline', enum: EicDiscipline, required: false })
  findByDate(
    @Query('date') date: string,
    @Query('discipline') discipline?: EicDiscipline,
  ) {
    return this.sessionSvc.findByDate(date, discipline);
  }

  @Get('sessions/:id')
  @RequirePermissions('EIC:SESSIONS:READ')
  @ApiOperation({ summary: 'Get session with entries' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessionSvc.findById(id);
  }

  @Post('sessions/:id/entries')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @ApiOperation({ summary: 'Add goal-activity entry to a draft session' })
  addEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSessionEntryDto,
  ) {
    return this.sessionSvc.addEntry(id, dto);
  }

  @Patch('sessions/:id/entries/:entryId')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @ApiOperation({ summary: 'Edit an entry in a draft session' })
  updateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: Partial<AddSessionEntryDto>,
  ) {
    return this.sessionSvc.updateEntry(id, entryId, dto);
  }

  @Delete('sessions/:id/entries/:entryId')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an entry from a draft session' })
  deleteEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.sessionSvc.deleteEntry(id, entryId);
  }

  @Post('sessions/:id/submit')
  @RequirePermissions('EIC:SESSIONS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_SESSION_SUBMIT', module: 'EIC', entityType: 'eic_therapy_sessions' })
  @ApiOperation({ summary: 'Submit session report (locks it)' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.sessionSvc.submit(id, actor.id);
  }
}
