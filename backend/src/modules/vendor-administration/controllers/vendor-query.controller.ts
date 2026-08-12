import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { VendorHmacGuard } from '../guards/vendor-hmac.guard';
import { AccountLockManagementService } from '../services/account-lock-management.service';
import { FeatureFlagsService } from '../../platform/feature-flags/feature-flags.service';

/** See command-dispatcher.service.ts's identical constant for context. */
const CV_STUDENT_PROVIDER_FLAG = 'cv.student.provider.internal';

@Controller('vendor/query')
@UseGuards(VendorHmacGuard)
export class VendorQueryController {
  constructor(
    private readonly accountLockService: AccountLockManagementService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  @Get('security/locked-users')
  async getLockedUsers(@Req() req: FastifyRequest) {
    return this.accountLockService.getLockedUsers();
  }

  @Get('system/info')
  async getSystemInfo(@Req() req: FastifyRequest) {
    return {
      version: '1.0.0', // Would typically come from package.json or config
      environment: process.env.NODE_ENV || 'development',
      startTime: process.uptime(),
    };
  }

  @Get('system/capabilities')
  async getSystemCapabilities(@Req() req: FastifyRequest) {
    return {
      features: [
        'security:users:unlock',
        'security:users:reset-attempts',
        'system:info',
        'system:capabilities',
        'modules:childrens-village:get-provider',
        'modules:childrens-village:set-provider',
      ],
      maintenanceModeSupported: true,
      bulkOperationsSupported: true,
    };
  }

  /**
   * Whether Children's Village is currently sourcing student demographics
   * from its own standalone table ('internal') or from Oracle HIS
   * ('oracle_his'). Resolves the platform-wide default (tenantId: null),
   * which is the correct, sufficient scope for a single-tenant self-hosted
   * install -- see command-dispatcher.service.ts's identical note on the
   * 'modules:childrens-village:set-provider' case.
   */
  @Get('modules/childrens-village/provider')
  async getChildrensVillageProvider(@Req() req: FastifyRequest) {
    const resolution = await this.featureFlagsService.resolve(null, CV_STUDENT_PROVIDER_FLAG);
    return { mode: resolution.enabled ? 'internal' : 'oracle_his', state: resolution.state, source: resolution.source };
  }
}
