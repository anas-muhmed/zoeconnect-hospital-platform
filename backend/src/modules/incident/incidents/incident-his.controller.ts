import {
  Controller, Get, Query, Param, UseGuards, UseInterceptors, ParseUUIDPipe, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { IncidentEmployeeService } from '../incidents/incident-employee.service';

/**
 * IncidentHisController — Oracle HIS + ZoeConnect user lookup endpoints.
 *
 * /incident/his/employee/search?q=TERM
 *   Searches via the fallback chain: Oracle HIS → ZoeConnect users → []
 *   Used by the CAPA owner picker and investigation lead picker.
 */
@ApiTags('Incident HIS Integration')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/his')
export class IncidentHisController {
  constructor(
    private readonly employeeService: IncidentEmployeeService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  @Get('employee/search')
  @RequirePermissions('INCIDENT:INCIDENTS:CREATE')
  @ApiOperation({
    summary: 'Search employees via Oracle HIS → ZoeConnect users fallback chain',
    description: 'Returns normalized EmployeeResult records from whichever source has data',
  })
  async searchEmployee(@Query('q') term: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    return this.employeeService.search(term || '', tenantId);
  }

  @Get('employee/:id')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({
    summary: 'Resolve a single employee/user by UUID',
    description: 'Used to render display names for stored owner/investigator/reporter IDs (triage assignee, CAPA owner, verifier, etc.) instead of raw UUIDs.',
  })
  async resolveEmployee(@Param('id', ParseUUIDPipe) id: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const result = await this.employeeService.resolveById(id, tenantId);
    if (!result) throw new NotFoundException(`Employee ${id} not found`);
    return result;
  }
}
