import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HisController }          from './his.controller';
import { PatientService }         from './patient/patient.service';
import { BillingService }         from './billing/billing.service';
import { HisLoyaltyBridgeService } from './billing/his-loyalty-bridge.service';
import { OracleDepositLogBridgeService } from './billing/oracle-deposit-log-bridge.service';
import { HisTokenBridgeService }   from './token/his-token-bridge.service';
import { HisBridgeProcessor }     from './token/his-bridge.processor';
import { VisitService }           from './visit/visit.service';
import { ReferenceService }       from './reference/reference.service';
import { HisConfigModule }        from './config/his-config.module';
import { LicensingModule }        from '../licensing/license.module';
import { RedisProvider }          from '../../common/redis/redis.provider';
import { UsersModule }            from '../users/users.module';
import { TenantModule }           from '../platform/tenant/tenant.module';

@Module({
  imports: [
    LicensingModule,
    HisConfigModule,
    UsersModule, // GET /his/user-context resolves employeeCode -> ZoeConnect user via UsersService
    // Fix (2026-07-21, tenant-scoped Oracle architecture): HisController
    // (and HisSyncController, via this module's export below) now apply
    // TenantContextInterceptor -- see HisController's doc comment. Nest
    // needs TenantModule imported here (not just transitively through
    // HisConfigModule, which imports TenantModule for its own providers
    // but doesn't re-export it) for that interceptor to be resolvable.
    TenantModule,
    BullModule.registerQueue({ name: 'his-bridge' }),  // provides HisConfigService + OraclePoolManager — used by all HIS services
  ],
  controllers: [HisController],
  providers: [
    PatientService,
    BillingService,
    HisLoyaltyBridgeService,
    OracleDepositLogBridgeService,
    HisTokenBridgeService,
    HisBridgeProcessor,
    VisitService,
    ReferenceService,
    RedisProvider,
  ],
  exports: [
    HisConfigModule,
    TenantModule,
    PatientService,
    BillingService,
    HisLoyaltyBridgeService,
    OracleDepositLogBridgeService,
    HisTokenBridgeService,
    VisitService,
    ReferenceService,
  ],
})
export class HisModule {}
