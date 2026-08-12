import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudTenantsController } from './cloud-tenants.controller';
import { CloudTenantsService } from './cloud-tenants.service';
import { CloudTenant } from './entities/cloud-tenant.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { AuthModule } from '../auth/auth.module';

// Cloud Tenant Onboarding, Phase B Step 6 (CLOUD_TENANT_ONBOARDING_DESIGN.md,
// Section 3).
//
// Customers merge (Phase 2, 2026-07-20) -- this module's original isolation
// from HospitalsModule was a deliberate choice at the time (see prior
// revision of this comment), but it created the exact gap the user flagged:
// a cloud tenant provisioned here had no ongoing management surface
// anywhere in Vendor Portal -- no license/user/HIS-config screen, nothing.
// Rather than duplicate HospitalsController's entire surface under
// `cloud-tenants`, CloudTenantsService now also injects the `Hospital`
// repository directly (not HospitalsModule/HospitalsService -- no circular
// dependency, just the one repository it needs) so `provision()` can create
// a linked `hospitals` row on success. See CloudTenantsService.
// linkHospitalRecord() for the full reasoning.
@Module({
  imports: [
    TypeOrmModule.forFeature([CloudTenant, Hospital]),
    AuthModule,
  ],
  controllers: [CloudTenantsController],
  providers: [CloudTenantsService],
  exports: [CloudTenantsService],
})
export class CloudTenantsModule {}
