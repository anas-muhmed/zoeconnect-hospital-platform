import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LicenseController }    from './license.controller';
import { CloudLicensingController } from './cloud-licensing.controller';
import { CloudLicensingHmacGuard }  from './guards/cloud-licensing-hmac.guard';
import { LicenseService }       from './license.service';
import { VendorSyncService }    from './vendor-sync.service';
import { LicenseGuard }         from './license.guard';
import { LicenseMaster }        from './entities/license-master.entity';
import { VendorRegistration }   from './entities/vendor-registration.entity';
import { LicenseRequestEntity } from './entities/license-request.entity';
import { SubscriptionLicense }  from './entities/subscription-license.entity';
import { AuditModule }          from '../audit/audit.module';
import { RedisProvider }        from '../../common/redis/redis.provider';
import { HisConfigModule }      from '../his/config/his-config.module';
import { SettingsModule }       from '../settings/settings.module';
import { ConnectorModule }      from '../platform/connector/connector.module';
import { FileLicenseProvider }         from './providers/file-license.provider';
import { SubscriptionLicenseProvider } from './providers/subscription-license.provider';
import { ILicenseProvider }     from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER }     from '../platform/infrastructure/tokens';

// Licensing Module Tenant-Scoping Migration, Phase 3 of 6 — same pattern
// used by CmsModule/FeedbackModule/LoyaltyModule: TenantModule for the
// shared tenant-resolution primitives, createTenantScopedRepositoryProvider()
// per entity that gains a scoped-repo consumer. SubscriptionLicense is
// deliberately excluded (see subscription-license.provider.ts's own doc
// comment) -- it already resolves/stamps tenantId via an explicit method
// parameter end-to-end (TenantProvisioningService write path,
// SubscriptionLicenseProvider.getStatus(tenantId) read path), which works
// correctly today; wrapping it in the ambient TenantScopedRepository
// pattern too would be a style change with no correctness benefit and a
// real risk of the two conventions fighting each other.
import { TenantModule }                         from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

/**
 * LICENSE_PROVIDER binding (Cloud Licensing API hardening, 2026-07-29,
 * superseding Phase 4 Task 4.3's original LICENSE_PROVIDER_MODE-only
 * selection).
 *
 * Provider selection is now DERIVED FROM `deployment.mode`
 * ('cloud' -> SubscriptionLicenseProvider, anything else -> FileLicenseProvider)
 * -- "aligns licensing behavior directly with the deployment model" per the
 * architecture review, instead of requiring a second, independently-settable
 * env var that could silently drift out of sync with DEPLOYMENT_MODE.
 *
 * `LICENSE_PROVIDER_MODE` still exists (env.validation.ts: optional, no
 * default -- deliberately NOT defaulted to 'file' anymore, so its absence
 * is distinguishable from an explicit 'file'/'subscription' value) purely
 * as an escape-hatch override for the rare case someone needs to force a
 * provider for testing/troubleshooting independent of DEPLOYMENT_MODE. When
 * set, it wins outright; when unset (the normal case for every real
 * deployment), `deployment.mode` decides. Every existing self-hosted
 * deployment (DEPLOYMENT_MODE unset or 'self_hosted', LICENSE_PROVIDER_MODE
 * unset) resolves to FileLicenseProvider exactly as before -- zero behavior
 * change. See licenseProviderFactory() below, and license.module.provider-selection.spec.ts.
 */
export function licenseProviderFactory(
  config: ConfigService,
  file: FileLicenseProvider,
  subscription: SubscriptionLicenseProvider,
): ILicenseProvider {
  const explicitOverride = config.get<string>('LICENSE_PROVIDER_MODE');
  if (explicitOverride === 'file' || explicitOverride === 'subscription') {
    return explicitOverride === 'subscription' ? subscription : file;
  }
  return config.get<string>('deployment.mode', 'self_hosted') === 'cloud' ? subscription : file;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([LicenseMaster, VendorRegistration, LicenseRequestEntity, SubscriptionLicense]),
    AuditModule,
    HisConfigModule,   // provides HisConfigService + OraclePoolService for HIS_CONFIG_UPDATE handling
    SettingsModule,
    TenantModule,
    ConnectorModule,   // D.6: provides ConnectorDirectoryService for the manual resync endpoint
    // ZoeConnect Identity Architecture Migration -- registered independently
    // here (same config as AuthModule's own JwtModule.registerAsync(), see
    // that module's identical block) rather than importing AuthModule
    // directly, which would create a circular module dependency (AuthModule
    // already imports LicensingModule). JwtModule is stateless/config-only,
    // so registering it a second time with the same secret is standard and
    // safe -- LicenseController needs a JwtService to optionally decode a
    // Bearer token on its @Public() GET /license/status route (see that
    // controller's doc comment for why: the route must keep working with no
    // token for the pre-login page, but should resolve the real tenant's
    // license status, not always the seeded 'default' tenant's, when a
    // session IS present).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [LicenseController, CloudLicensingController],
  providers: [
    LicenseService,
    VendorSyncService,
    LicenseGuard,
    CloudLicensingHmacGuard,
    RedisProvider,
    FileLicenseProvider,
    SubscriptionLicenseProvider,
    {
      provide: LICENSE_PROVIDER,
      useFactory: licenseProviderFactory,
      inject: [ConfigService, FileLicenseProvider, SubscriptionLicenseProvider],
    },

    // Licensing Module Tenant-Scoping Migration, Phase 3 of 6 -- scoped
    // repositories for the session-JWT-authenticated read paths only
    // (VendorSyncService.getRegistrationForCurrentTenant(), submitRequest(),
    // listRequests(), markRequestResolved(), markAllRequestsRevoked();
    // LicenseService.getHistory()). Machine-token-authenticated paths
    // (verifyWebhookSignature(), validateInstanceToken(), notifyPasswordResetRequest(),
    // and internalProvision() -- left untouched pending the architectural
    // decision about its role) keep using the raw repositories above,
    // exactly like CmsDisplayService.findBySlug() stays raw for
    // chain-resolved player routes alongside CMSDisplayAssignment's own
    // scoped provider for its session-resolved admin routes.
    createTenantScopedRepositoryProvider(VendorRegistration, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(LicenseRequestEntity, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(LicenseMaster, { mode: 'enforced' }),
  ],
  exports: [LicenseService, LicenseGuard, VendorSyncService, LICENSE_PROVIDER],
})
export class LicensingModule {}
