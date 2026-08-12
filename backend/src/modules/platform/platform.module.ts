import { Module } from '@nestjs/common';
import { PlatformInfrastructureModule } from './infrastructure/platform-infrastructure.module';
import { PlatformServicesModule } from './services/platform-services.module';
import { TenantModule } from './tenant/tenant.module';
import { StorageModule } from './services/object-repository/object-repository.module';

@Module({
  imports: [
    PlatformInfrastructureModule,
    PlatformServicesModule,
    TenantModule,
    StorageModule,
  ],
  exports: [
    PlatformInfrastructureModule,
    PlatformServicesModule,
    TenantModule,
    StorageModule,
  ],
})
export class PlatformModule {}
