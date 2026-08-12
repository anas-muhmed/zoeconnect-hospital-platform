import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantProvisioningRun } from './entities/tenant-provisioning-run.entity';
import { TenantProvisioningStep } from './entities/tenant-provisioning-step.entity';
import { TenantConnectorPairing } from './entities/tenant-connector-pairing.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Role } from '../../rbac/entities/role.entity';
import { Permission } from '../../rbac/entities/permission.entity';
import { SubscriptionLicense } from '../../licensing/entities/subscription-license.entity';
import { VendorRegistration } from '../../licensing/entities/vendor-registration.entity';
import { User } from '../../users/entities/user.entity';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantProvisioningController } from './tenant-provisioning.controller';
import { VendorPortalApiKeyGuard } from './guards/vendor-portal-api-key.guard';
import { AuthModule } from '../../auth/auth.module';
import { ConnectorModule } from '../connector/connector.module';
import { AuditModule } from '../../audit/audit.module';
import { HisConfigModule } from '../../his/config/his-config.module';
import { OrganizationBranchModule } from '../../organization-branch/organization-branch.module';

/**
 * TenantProvisioningModule (Phase 10).
 *
 * Deliberately a standalone platform-layer module, not folded into
 * AuthModule/RbacModule/LicensingModule -- it consumes their entities
 * directly (TypeOrmModule.forFeature covers all of them here) plus
 * AuthModule's AuthService (for setupSuperAdmin), rather than depending on
 * RbacModule/LicensingModule's own providers, since this phase's Steps 3-5
 * only need read access to Role/Permission and a plain repository.save()
 * for SubscriptionLicense -- no existing service in those modules offers a
 * narrower surface than that.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantProvisioningRun,
      TenantProvisioningStep,
      TenantConnectorPairing,
      Tenant,
      Role,
      Permission,
      SubscriptionLicense,
      // Cloud Licensing API (2026-07-29) -- stepIssueTrialLicense() creates
      // this tenant's VendorRegistration row directly (explicit tenantId,
      // no ambient TenantContextStorage) rather than via
      // VendorSyncService.autoRegisterCloudTenant(); see that step's doc
      // comment and this module's own doc comment on why entities are
      // consumed directly here instead of importing LicensingModule.
      VendorRegistration,
      // Tenant-Scoped User Identity, Task 9 -- checkAvailability()'s
      // global username/email/hisEmployeeCode advisory scan.
      User,
    ]),
    AuthModule,
    ConnectorModule, // D.6: ConnectorDirectoryService/ConnectorGateway for the connector-status read endpoint
    AuditModule,     // Task #102: AuditService.findRecentForTenant() for the Connector activity panel + audit logging on republish/resync
    HisConfigModule, // Task #102: HisQueryDefinitionPublisherService for republish/resync/definitions-summary
    OrganizationBranchModule, // ZoeConnect Identity Architecture Migration, Phase 1 -- stepCreateDefaultOrgBranch()
  ],
  providers: [TenantProvisioningService, VendorPortalApiKeyGuard],
  controllers: [TenantProvisioningController],
  exports: [TenantProvisioningService],
})
export class TenantProvisioningModule {}
