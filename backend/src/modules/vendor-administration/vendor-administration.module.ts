import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { VendorQueryController } from './controllers/vendor-query.controller';
import { VendorCommandController } from './controllers/vendor-command.controller';
import { CommandDispatcherService } from './services/command-dispatcher.service';
import { AccountLockManagementService } from './services/account-lock-management.service';
import { LicensingModule } from '../licensing/license.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../platform/tenant/tenant.module';
import { FeatureFlagsModule } from '../platform/feature-flags/feature-flags.module';

@Module({
  imports: [
    LicensingModule,
    UsersModule,
    AuditModule,
    AuthModule,
    // Tenant-Scoped User Identity, Task 5 -- AccountLockManagementService
    // now needs TenantContextStorage to stamp tenantId on createUser().
    // UsersModule imports TenantModule itself but only exports
    // UsersService/TypeOrmModule, not TenantModule, so it must be imported
    // directly here too.
    TenantModule,
    FeatureFlagsModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
  ],
  controllers: [VendorQueryController, VendorCommandController],
  providers: [
    CommandDispatcherService,
    AccountLockManagementService,
  ],
})
export class VendorAdministrationModule {}
