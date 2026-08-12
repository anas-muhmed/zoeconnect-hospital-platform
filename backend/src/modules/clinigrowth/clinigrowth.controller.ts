import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import { ClinigrowthService } from './clinigrowth.service';

/**
 * CliniGrowth integration (delivery phase). Ports `patientVitals.routes.js`.
 *
 * Reuses `PLATFORM:HIS:READ` — the same permission `HisController` already
 * gates every other "read a patient from HIS" endpoint behind — rather than
 * inventing a new CLINIGROWTH-specific permission for what is functionally
 * the identical operation (source only required generic authentication,
 * no role restriction at all; this is a strictly narrower, not invented,
 * authorization surface).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('clinigrowth')
export class ClinigrowthController {
  constructor(private readonly clinigrowthService: ClinigrowthService) {}

  @Get('patients/:mrno/vitals')
  @RequirePermissions('PLATFORM:HIS:READ')
  getPatientVitals(@Param('mrno') mrno: string) {
    return this.clinigrowthService.getPatientVitals(mrno);
  }
}
