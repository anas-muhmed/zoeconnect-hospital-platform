import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CloudLicensingHmacGuard } from '../licensing/guards/cloud-licensing-hmac.guard';
import { FeatureFlagsService } from '../platform/feature-flags/feature-flags.service';

/** See adr/0001-cv-student-provider-abstraction.md and
 * adr/0002-vendor-portal-adapter-selection.md -- the flag
 * `CVStudentProviderManager` reads to decide whether to inject
 * `InternalStudentProvider` (standalone) or `OracleHisStudentProvider`
 * (HIS-integrated) for a tenant. */
const CV_STUDENT_PROVIDER_FLAG = 'cv.student.provider.internal';

interface SetCvProviderDto {
  mode: 'internal' | 'oracle_his';
}

/**
 * Cloud Modules Config API -- the Children's Village counterpart of
 * `CloudPasswordResetController` (`platform/security/tenants/:tenantId/password-reset`)
 * and `CloudLicensingController` (`platform/licensing/tenants/:tenantId/subscription`).
 *
 * Self-hosted instances get this control via the Vendor Gateway's
 * HMAC-signed Remote Admin command (`VendorCommandController` ->
 * `modules/childrens-village/actions/set-provider`), which reaches a single
 * physical instance at `publicIp:publicPort`. Cloud tenants have no such
 * physical instance to address -- same reasoning as
 * `VendorGatewayService.assertSelfHosted()` -- so Vendor Portal calls this
 * endpoint directly instead, addressed by `hdspTenantId` and authenticated
 * exactly like Cloud Licensing/Cloud Security: `@Public()` +
 * `CloudLicensingHmacGuard`, which verifies `X-Vendor-Signature` over the
 * raw body against that tenant's `VendorRegistration.instanceSecret`.
 *
 * `tenantId` here is real and per-tenant (unlike the self-hosted command,
 * which has no ambient tenant and falls back to the platform-wide default
 * flag row) -- cloud is genuinely multi-tenant, so the flag is set as a
 * tenant-scoped override, not the global default.
 */
@ApiTags('Cloud Modules Config')
@Controller('platform/modules/childrens-village/tenants')
export class CvCloudProviderConfigController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  // POST rather than GET, deliberately -- every other endpoint behind
  // CloudLicensingHmacGuard in this codebase (CloudPasswordResetController,
  // CloudLicensingController) is POST/PUT with a real signed body. There's
  // no precedent here for a GET request's raw (empty) body flowing through
  // Fastify's rawBody capture + this guard's HMAC check, so this "query"
  // is a POST with an empty JSON body to stay on the exact same tested path
  // rather than being the first thing in this codebase to rely on that.
  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Post(':tenantId/provider/query')
  @ApiOperation({ summary: "Get a cloud tenant's Children's Village student data source (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)" })
  @ApiHeader({ name: 'X-Vendor-Signature', description: "sha256=<hmac> over the raw request body (\"{}\"), keyed by this tenant's VendorRegistration.instanceSecret" })
  async getProvider(@Param('tenantId') tenantId: string) {
    const resolution = await this.featureFlagsService.resolve(tenantId, CV_STUDENT_PROVIDER_FLAG);
    return { mode: resolution.enabled ? 'internal' : 'oracle_his', state: resolution.state, source: resolution.source };
  }

  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Post(':tenantId/provider')
  @ApiOperation({ summary: "Set a cloud tenant's Children's Village student data source (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)" })
  @ApiHeader({ name: 'X-Vendor-Signature', description: "sha256=<hmac> over the raw request body, keyed by this tenant's VendorRegistration.instanceSecret" })
  async setProvider(
    @Param('tenantId') tenantId: string,
    @Body() dto: SetCvProviderDto,
  ) {
    const saved = await this.featureFlagsService.setFlag({
      tenantId,
      featureKey: CV_STUDENT_PROVIDER_FLAG,
      state: dto.mode === 'internal' ? 'enabled' : 'disabled',
      description: "Children's Village student data source (standalone internal DB vs Oracle HIS-integrated), set via Vendor Portal",
      updatedBy: 'VENDOR_PORTAL',
    });
    return { mode: dto.mode, state: saved.state };
  }
}
