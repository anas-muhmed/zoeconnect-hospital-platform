import { Module } from '@nestjs/common';
import { HisSyncService }      from './his-sync.service';
import { HisSyncScheduler }    from './his-sync.scheduler';
import { HisSyncController }   from './his-sync.controller';
import { HisModule }           from '../his.module';
import { LoyaltyModule }       from '../../loyalty/loyalty.module';
import { LicensingModule }     from '../../licensing/license.module';
import { RedisProvider }       from '../../../common/redis/redis.provider';

/**
 * HisSyncModule — real-time bill-to-loyalty sync
 *
 * Kept separate from HisModule to avoid a circular dependency:
 *   LoyaltyModule → HisModule (for PatientService)
 *   HisSyncModule → HisModule + LoyaltyModule (for both services)
 *
 * Import HisSyncModule in AppModule (not in HisModule or LoyaltyModule).
 */
@Module({
  imports: [
    HisModule,       // provides BillingService, PatientService via exports
    LoyaltyModule,   // provides EnrollmentService, TransactionService via exports
    LicensingModule, // provides LicenseService required by LicenseGuard
  ],
  controllers: [HisSyncController],
  providers: [
    RedisProvider,     // for @InjectRedis() in HisSyncService
    HisSyncService,
    HisSyncScheduler,
  ],
  exports: [HisSyncService],
})
export class HisSyncModule {}
