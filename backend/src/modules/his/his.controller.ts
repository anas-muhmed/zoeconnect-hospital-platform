import {
  Controller, Get, Inject, Param, Query, Req, UseGuards, UseInterceptors,
  ParseIntPipe, DefaultValuePipe, Delete,
  HttpCode, HttpStatus, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery,
  ApiParam, ApiResponse,
} from '@nestjs/swagger';
import { PatientService }   from './patient/patient.service';
import { BillingService }   from './billing/billing.service';
import { VisitService }     from './visit/visit.service';
import { ReferenceService } from './reference/reference.service';
import { IOracleTransport } from '../platform/infrastructure/oracle/oracle-transport.interface';
import { ORACLE_TRANSPORT } from '../platform/infrastructure/tokens';
import { JwtAuthGuard }     from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { LicenseGuard }     from '../licensing/license.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule }    from '../licensing/decorators/require-module.decorator';
import { Public }           from '../../common/decorators/public.decorator';
import { UsersService }     from '../users/users.service';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';

// Fix (2026-07-21, CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 3 -- tenant-scoped
// Oracle architecture): this controller never applied TenantContextInterceptor,
// same gap TokenController had earlier this session. Every business Oracle
// query here goes through IOracleTransport -> OraclePoolManager, which now
// resolves the ambient tenant to route to the correct per-tenant Oracle
// pool -- without this interceptor, `TenantContextStorage.currentTenantIdOrNull()`
// would always return null and every authenticated HIS request would
// silently fall through to the default/self-hosted pool, which is wrong
// for any real cloud tenant with its own Oracle DB.
@ApiTags('HIS Integration')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('PLATFORM')
@Controller('his')
export class HisController {
  constructor(
    private readonly patientSvc:   PatientService,
    private readonly billingSvc:   BillingService,
    private readonly visitSvc:     VisitService,
    private readonly referenceSvc: ReferenceService,
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
    private readonly usersSvc:     UsersService,
  ) {}

  // ── HIS Status ─────────────────────────────────────────────────────────
  @Get('status')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Check Oracle HIS connectivity' })
  getStatus() {
    return { available: this.oracle.isAvailable };
  }

  // ── Patient Search ──────────────────────────────────────────────────────
  @Get('patients/search')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Search patients by MRN, name, or mobile' })
  @ApiQuery({ name: 'q', description: 'MRN / name / mobile', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  searchPatients(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.patientSvc.search(q, Math.min(limit, 100));
  }

  // ── Patient by MRN ──────────────────────────────────────────────────────
  @Get('patients/:mrn')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get patient details by MRN' })
  @ApiParam({ name: 'mrn', description: 'Patient UHID / MRN' })
  @ApiResponse({ status: 404, description: 'Patient not found in HIS' })
  @ApiResponse({ status: 503, description: 'HIS unavailable' })
  getPatient(@Param('mrn') mrn: string) {
    return this.patientSvc.getByMrn(mrn.toUpperCase());
  }

  // ── Bills by MRN ────────────────────────────────────────────────────────
  @Get('patients/:mrn/bills')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get bill list for a patient' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPatientBills(
    @Param('mrn') mrn: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.billingSvc.getBillsByMrn(mrn.toUpperCase(), Math.min(limit, 200));
  }

  // ── Single Bill with items ───────────────────────────────────────────────
  @Get('bills/:billId')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get full bill with line items' })
  @ApiResponse({ status: 404, description: 'Bill not found' })
  getBill(@Param('billId') billId: string) {
    return this.billingSvc.getBillById(billId);
  }

  // ── Visits by MRN ───────────────────────────────────────────────────────
  @Get('patients/:mrn/visits')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get visit history for a patient' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: ['OPD','IPD','EMERGENCY','DAY_CARE'] })
  getPatientVisits(
    @Param('mrn') mrn: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') visitType?: string,
  ) {
    return this.visitSvc.getVisitsByMrn(mrn.toUpperCase(), {
      limit: Math.min(limit, 200),
      visitType,
    });
  }

  // ── Reference data: Departments ─────────────────────────────────────────
  @Get('reference/departments')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get department list from HIS' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  getDepartments(@Query('activeOnly') activeOnly?: string) {
    return this.referenceSvc.getDepartments(activeOnly !== 'false');
  }

  // ── Reference data: Doctors ─────────────────────────────────────────────
  @Get('reference/doctors')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get doctor list from HIS' })
  @ApiQuery({ name: 'deptCode', required: false, type: String })
  getDoctors(@Query('deptCode') deptCode?: string) {
    return this.referenceSvc.getDoctors(deptCode);
  }

  @Get('reference/employees')
  @RequirePermissions('PLATFORM:HIS:READ')
  @ApiOperation({ summary: 'Get employee list from HIS' })
  @ApiQuery({ name: 'q', required: false, description: 'Optional name filter (server-side LIKE search)' })
  getEmployees(@Query('q') q?: string) {
    return this.referenceSvc.getEmployees(q);
  }

  // ── Registration Assistant identity resolution ───────────────────────────
  //
  // @Public(): called by the ZoeConnect Registration Assistant panel before any
  // ZoeConnect session exists -- the whole point of the workstation-based popup/
  // panel design (see docs/his-integration/POPUP_INTEGRATION_ARCHITECTURE.md)
  // is that a receptionist never has to log into ZoeConnect. This route is the one
  // exception to "no identity" in that design: it's how the panel discovers
  // whether the HIS username already showing on screen happens to correspond
  // to a mapped ZoeConnect user, purely to (a) label the workstation config with a
  // real name instead of "walk-up" and (b) gate the "Change Configuration"
  // action to staff who are actually mapped, per the mockup's "for
  // authorized users" requirement. It changes nothing about auth for the
  // reserve/heartbeat/map calls themselves, which remain scoped to the
  // workstation session token exactly as before.
  //
  // Deliberately does NOT expose anything beyond username/employeeCode/a
  // permission-key list already visible to the mapped user's own ZoeConnect
  // session elsewhere -- an unmapped username just gets { mapped: false }.
  @Get('user-context')
  @Public()
  @ApiOperation({ summary: 'Resolve a HIS username to a mapped ZoeConnect user, if any (Registration Assistant)' })
  @ApiQuery({ name: 'username', required: true, description: 'HIS username read from the HIS page DOM' })
  async getUserContext(
    @Query('username') username: string | undefined,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    if (!username) throw new BadRequestException('username is required');
    // Tenant-Scoped User Identity, Task 2: req.tenantId is set ambiently by
    // SubdomainTenantMiddleware on every request, including this @Public()
    // one -- see AuthController.hisLogin()'s identical pattern.
    if (!req.tenantId) throw new UnauthorizedException('Unable to resolve tenant for this request');

    const hisUser = await this.referenceSvc.getUserContext(username);
    if (!hisUser) return { username, found: false, mapped: false, hdspUser: null };

    const hdspUser = await this.usersSvc.findByHisEmployeeCode(hisUser.employeeCode, req.tenantId);
    if (!hdspUser) {
      return { username: hisUser.username, employeeCode: hisUser.employeeCode, found: true, mapped: false, hdspUser: null };
    }

    return {
      username:     hisUser.username,
      employeeCode: hisUser.employeeCode,
      found:        true,
      mapped:       true,
      hdspUser: {
        id:          hdspUser.id,
        username:    hdspUser.username,
        fullName:    hdspUser.fullName,
        permissions: hdspUser.permissionKeys,
      },
    };
  }

  // ── Cache management ─────────────────────────────────────────────────────
  @Delete('cache/patient/:mrn')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('PLATFORM:HIS:ADMIN')
  @ApiOperation({ summary: 'Invalidate Redis cache for a patient (admin)' })
  invalidatePatientCache(@Param('mrn') mrn: string) {
    return this.patientSvc.invalidateCache(mrn.toUpperCase());
  }

  @Delete('cache/reference')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('PLATFORM:HIS:ADMIN')
  @ApiOperation({ summary: 'Invalidate all HIS reference data caches (admin)' })
  invalidateReferenceCache() {
    return this.referenceSvc.invalidateReferenceCache();
  }
}
