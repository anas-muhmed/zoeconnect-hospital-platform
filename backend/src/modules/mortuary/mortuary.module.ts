import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MortuaryHospitalProfile } from './entities/mortuary-hospital-profile.entity';
import { MortuarySystemSettings } from './entities/mortuary-system-settings.entity';
import { MortuaryStaffProfile } from './entities/mortuary-staff-profile.entity';
import { MortuaryBodyType } from './entities/mortuary-body-type.entity';
import { MortuaryConcessionAuthority } from './entities/mortuary-concession-authority.entity';
import { MortuaryBody } from './entities/mortuary-body.entity';
import { MortuaryCabin } from './entities/mortuary-cabin.entity';
import { MortuaryCabinAllocation } from './entities/mortuary-cabin-allocation.entity';
import { MortuaryBilling } from './entities/mortuary-billing.entity';
import { MortuaryBillingService } from './entities/mortuary-billing-service.entity';
import { MortuaryServiceBilling } from './entities/mortuary-service-billing.entity';
import { MortuaryServiceMaster } from './entities/mortuary-service-master.entity';
import { MortuaryBodyRelease } from './entities/mortuary-body-release.entity';
import { MortuaryHousekeepingTask } from './entities/mortuary-housekeeping-task.entity';

/**
 * zoe-platform Mortuary module integration (Phase 2).
 *
 * Stage A: entities + module registration only. Controllers/services/DTOs
 * are added in Stage C once auth/RBAC/tenant wiring (Stage D) and the
 * business-logic port are ready — this module intentionally exposes
 * nothing yet.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MortuaryHospitalProfile,
      MortuarySystemSettings,
      MortuaryStaffProfile,
      MortuaryBodyType,
      MortuaryConcessionAuthority,
      MortuaryBody,
      MortuaryCabin,
      MortuaryCabinAllocation,
      MortuaryBilling,
      MortuaryBillingService,
      MortuaryServiceBilling,
      MortuaryServiceMaster,
      MortuaryBodyRelease,
      MortuaryHousekeepingTask,
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class MortuaryModule {}
