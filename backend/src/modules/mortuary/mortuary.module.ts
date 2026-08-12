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
import { MortuaryBillingService as MortuaryBillingServiceEntity } from './entities/mortuary-billing-service.entity';
import { MortuaryServiceBilling } from './entities/mortuary-service-billing.entity';
import { MortuaryServiceMaster } from './entities/mortuary-service-master.entity';
import { MortuaryBodyRelease } from './entities/mortuary-body-release.entity';
import { MortuaryHousekeepingTask } from './entities/mortuary-housekeeping-task.entity';

import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantModule } from '../platform/tenant/tenant.module';

import { MortuaryBodyTypesService } from './services/mortuary-body-types.service';
import { MortuaryConcessionAuthoritiesService } from './services/mortuary-concession-authorities.service';
import { MortuarySettingsService } from './services/mortuary-settings.service';
import { MortuaryCabinsService } from './services/mortuary-cabins.service';
import { MortuaryServiceMasterService } from './services/mortuary-service-master.service';
import { MortuaryBodiesService } from './services/mortuary-bodies.service';
import { MortuaryCabinAllocationsService } from './services/mortuary-cabin-allocations.service';
import { MortuaryBillingService } from './services/mortuary-billing.service';
import { MortuaryBodyReleasesService } from './services/mortuary-body-releases.service';
import { MortuaryHousekeepingService } from './services/mortuary-housekeeping.service';

import { MortuaryReferenceController } from './controllers/mortuary-reference.controller';
import { MortuaryConcessionAuthoritiesController } from './controllers/mortuary-concession-authorities.controller';
import { MortuarySettingsController } from './controllers/mortuary-settings.controller';
import { MortuaryCabinsController } from './controllers/mortuary-cabins.controller';
import { MortuaryServiceMasterController } from './controllers/mortuary-service-master.controller';
import { MortuaryBodiesController } from './controllers/mortuary-bodies.controller';
import { MortuaryCabinAllocationsController } from './controllers/mortuary-cabin-allocations.controller';
import { MortuaryBillingController, MortuaryServiceBillingController } from './controllers/mortuary-billing.controller';
import { MortuaryBodyReleasesController } from './controllers/mortuary-body-releases.controller';
import { MortuaryHousekeepingController } from './controllers/mortuary-housekeeping.controller';

/**
 * zoe-platform Mortuary module integration (Phase 2).
 *
 * Stage C: core business-logic services + controllers + DTOs for the body
 * registration -> cabin allocation -> billing -> release -> housekeeping
 * workflow, plus its supporting reference data (body types, concession
 * authorities, service master, tenant settings). See the Stage C report
 * for exactly what was ported, what was deferred (uploads/Stage E,
 * hospital CRUD/already ZoeConnect's job, dashboard+reports, staff
 * approval workflow/Stage D auth), and every business rule/bug
 * disposition.
 *
 * `TenantScopedRepository` providers below cover every tenant-scoped
 * entity except `MortuaryBodyType` (verified global reference data,
 * Stage A/B) and `MortuaryHospitalProfile`/`MortuaryStaffProfile` reads,
 * which currently only need the plain repository (staff-profile lifecycle
 * itself is Stage D scope).
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
      MortuaryBillingServiceEntity,
      MortuaryServiceBilling,
      MortuaryServiceMaster,
      MortuaryBodyRelease,
      MortuaryHousekeepingTask,
    ]),
    // Required for TenantContextInterceptor (used on every Mortuary
    // controller) and TenantContextStorage (which every
    // TenantScopedRepository provider below depends on) to be resolvable
    // in this module's injector context. Missing this import is a real,
    // caught-at-boot NestJS dependency-resolution error, not a style
    // preference — found during Stage C.1's live-boot verification
    // (see Stage C.1 report).
    TenantModule,
  ],
  controllers: [
    MortuaryReferenceController,
    MortuaryConcessionAuthoritiesController,
    MortuarySettingsController,
    MortuaryCabinsController,
    MortuaryServiceMasterController,
    MortuaryBodiesController,
    MortuaryCabinAllocationsController,
    MortuaryBillingController,
    MortuaryServiceBillingController,
    MortuaryBodyReleasesController,
    MortuaryHousekeepingController,
  ],
  providers: [
    // Services
    MortuaryBodyTypesService,
    MortuaryConcessionAuthoritiesService,
    MortuarySettingsService,
    MortuaryCabinsService,
    MortuaryServiceMasterService,
    MortuaryBodiesService,
    MortuaryCabinAllocationsService,
    MortuaryBillingService,
    MortuaryBodyReleasesService,
    MortuaryHousekeepingService,
    // Tenant-scoped repository providers (Step 4)
    createTenantScopedRepositoryProvider(MortuaryHospitalProfile),
    createTenantScopedRepositoryProvider(MortuarySystemSettings),
    createTenantScopedRepositoryProvider(MortuaryStaffProfile),
    createTenantScopedRepositoryProvider(MortuaryConcessionAuthority),
    createTenantScopedRepositoryProvider(MortuaryBody),
    createTenantScopedRepositoryProvider(MortuaryCabin),
    createTenantScopedRepositoryProvider(MortuaryCabinAllocation),
    createTenantScopedRepositoryProvider(MortuaryBilling),
    createTenantScopedRepositoryProvider(MortuaryBillingServiceEntity),
    createTenantScopedRepositoryProvider(MortuaryServiceBilling),
    createTenantScopedRepositoryProvider(MortuaryServiceMaster),
    createTenantScopedRepositoryProvider(MortuaryBodyRelease),
    createTenantScopedRepositoryProvider(MortuaryHousekeepingTask),
  ],
  exports: [],
})
export class MortuaryModule {}
