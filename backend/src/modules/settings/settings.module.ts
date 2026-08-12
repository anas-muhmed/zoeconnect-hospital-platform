import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from './entities/system-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { TenantModule } from '../platform/tenant/tenant.module';

// Fix (2026-07-20): TenantModule imported so SettingsService can inject
// TenantContextStorage -- see that service's doc comment for why (tenant
// isolation fix for system_settings).
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting]), TenantModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [TypeOrmModule, SettingsService],
})
export class SettingsModule {}
