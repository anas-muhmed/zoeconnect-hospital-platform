import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrugIndentingStaffProfile } from './entities/drug-indenting-staff-profile.entity';
import { DrugRequest } from './entities/drug-request.entity';
import { DrugAlternative } from './entities/drug-alternative.entity';
import { DrugAlternativeNegotiation } from './entities/drug-alternative-negotiation.entity';
import { BlacklistedCompany } from './entities/blacklisted-company.entity';
import { UserRequestQuota } from './entities/user-request-quota.entity';
import { DrugAuditLog } from './entities/drug-audit-log.entity';

import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantModule } from '../platform/tenant/tenant.module';

import { DrugRequestsController } from './controllers/drug-requests.controller';
import { DrugDtcController } from './controllers/drug-dtc.controller';
import { DrugQuotaController } from './controllers/drug-quota.controller';
import { DrugRequestsService } from './services/drug-requests.service';
import { DrugDtcService } from './services/drug-dtc.service';
import { DrugQuotaService } from './services/drug-quota.service';

/**
 * zoe-platform Drug Indenting integration (ZoeConnect delivery phase).
 *
 * Entities/module registration only, matching Mortuary's Stage A scope.
 * Scope for this integration pass (deferred items and rationale in the
 * delivery-phase compact report): AI content generation, analytics/
 * dashboard, analysis drafts, remark-history autocomplete, full user-
 * facing notifications feature (audit trail via DrugAuditLog is in
 * scope; broadcast notifications are not), admin user-management
 * endpoints, drug_existing_details.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DrugIndentingStaffProfile,
      DrugRequest,
      DrugAlternative,
      DrugAlternativeNegotiation,
      BlacklistedCompany,
      UserRequestQuota,
      DrugAuditLog,
    ]),
    TenantModule,
  ],
  controllers: [DrugRequestsController, DrugDtcController, DrugQuotaController],
  providers: [
    createTenantScopedRepositoryProvider(DrugIndentingStaffProfile),
    createTenantScopedRepositoryProvider(DrugRequest),
    createTenantScopedRepositoryProvider(DrugAlternative),
    createTenantScopedRepositoryProvider(DrugAlternativeNegotiation),
    createTenantScopedRepositoryProvider(BlacklistedCompany),
    createTenantScopedRepositoryProvider(UserRequestQuota),
    createTenantScopedRepositoryProvider(DrugAuditLog),
    DrugRequestsService,
    DrugDtcService,
    DrugQuotaService,
  ],
  exports: [],
})
export class DrugIndentingModule {}
