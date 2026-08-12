import {
  Controller, Get, Post, Put, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EicPatientService } from './eic-patient.service';
import { EicEnrollmentService } from '../enrollment/eic-enrollment.service';
import { ReferenceService } from '../../his/reference/reference.service';
import { CreateEicPatientDto } from './dto/create-patient.dto';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { LicenseGuard }       from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule }      from '../../licensing/decorators/require-module.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { CurrentUser }        from '../../../common/decorators/current-user.decorator';
import { Audit }              from '../../../common/decorators/audit.decorator';
import type { User }          from '../../users/entities/user.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@ApiTags('EIC — Patients')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('EIC')
@Controller('eic/patients')
export class EicPatientController {
  constructor(
    private readonly patientSvc: EicPatientService,
    private readonly enrollmentSvc: EicEnrollmentService,
    private readonly referenceSvc: ReferenceService,
  ) {}

  /** Doctor typeahead — search HIS doctors by name (for therapist autocomplete) */
  @Get('doctors-suggest')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Search HIS doctors by partial name for therapist autocomplete' })
  @ApiQuery({ name: 'q', required: false, description: 'Partial doctor name' })
  async doctorsSuggest(@Query('q') q?: string) {
    const all = await this.referenceSvc.getDoctors();
    if (!q?.trim()) return all.slice(0, 20);
    const term = q.trim().toLowerCase();
    return all
      .filter(
        (d) =>
          d.doctorName.toLowerCase().includes(term) ||
          d.doctorCode.toLowerCase().includes(term) ||
          d.specialization?.toLowerCase().includes(term),
      )
      .slice(0, 20);
  }

  /** List all EIC patients with optional name/MRN search */
  @Get()
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'List EIC patients (optionally filter by name/MRN)' })
  @ApiQuery({ name: 'q', required: false })
  findAll(@Query('q') q?: string, @ActiveBranchId() branchId?: string) {
    return this.patientSvc.findAll(q, branchId);
  }

  /** Autocomplete — search HIS by partial MRN or name, returns lightweight suggestions */
  @Get('his-suggest')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Typeahead search against HIS (partial MRN or patient name)' })
  @ApiQuery({ name: 'q', required: true, description: 'Partial MRN or patient name' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  hisSuggest(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.patientSvc.hisSearch(q, limit ? parseInt(limit, 10) : 10);
  }

  /** Search patient by exact MRN — returns full HIS data + existing EIC record if any */
  @Get('search')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Lookup patient by MRN (HIS + EIC)' })
  @ApiQuery({ name: 'mrn', required: true })
  lookupByMrn(@Query('mrn') mrn: string) {
    return this.patientSvc.lookupByMrn(mrn);
  }

  /** HIS sync status for all EIC patients */
  @Get('sync-status')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Get HIS sync status for all EIC patients' })
  getSyncStatus() {
    return this.patientSvc.getSyncStatus();
  }

  /** Batch sync all active EIC patients from HIS (background job) */
  @Post('sync-all')
  @RequirePermissions('EIC:PATIENTS:CREATE')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'EIC_PATIENT_BATCH_SYNC', module: 'EIC', entityType: 'eic_patient' })
  @ApiOperation({ summary: 'Batch sync all active EIC patients from Oracle HIS' })
  batchSyncFromHis(@CurrentUser() actor: User) {
    return this.patientSvc.batchSyncFromHis(actor.id);
  }

  /** Get EIC patient profile */
  @Get(':id')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Get EIC patient by ID' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientSvc.findById(id);
  }

  /** Create patient manually (when HIS is unavailable) */
  @Post('manual')
  @RequirePermissions('EIC:PATIENTS:CREATE')
  @Audit({ action: 'EIC_PATIENT_MANUAL_CREATE', module: 'EIC', entityType: 'eic_patient' })
  @ApiOperation({ summary: 'Create EIC patient manually (HIS fallback)' })
  createManual(
    @Body() dto: CreateEicPatientDto,
    @CurrentUser() actor: User,
    @ActiveBranchId() branchId: string,
  ) {
    return this.patientSvc.createManual(dto, actor.id, branchId);
  }

  /** Force sync demographics from HIS */
  @Post(':id/sync-his')
  @RequirePermissions('EIC:PATIENTS:CREATE')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'EIC_PATIENT_HIS_SYNC', module: 'EIC', entityType: 'eic_patient' })
  @ApiOperation({ summary: 'Sync patient demographics from Oracle HIS' })
  syncFromHis(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.patientSvc.syncFromHis(id, actor.id);
  }

  /** Get developmental history for a patient */
  @Get(':id/developmental-history')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'Get developmental history for patient' })
  getDevelopmentalHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientSvc.getDevelopmentalHistory(id);
  }

  /** List all enrollments for a patient */
  @Get(':id/enrollments')
  @RequirePermissions('EIC:PATIENTS:READ')
  @ApiOperation({ summary: 'List therapy enrollments for a patient' })
  getPatientEnrollments(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentSvc.findByPatient(id);
  }

  /** Save / update developmental history */
  @Put(':id/developmental-history')
  @RequirePermissions('EIC:PATIENTS:CREATE')
  @Audit({ action: 'EIC_DEV_HISTORY_SAVE', module: 'EIC', entityType: 'eic_developmental_history' })
  @ApiOperation({ summary: 'Save developmental history for patient' })
  saveDevelopmentalHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: User,
  ) {
    return this.patientSvc.saveDevelopmentalHistory(id, body as any, actor.id);
  }
}
