import { Module } from '@nestjs/common';
import { ClinigrowthController } from './clinigrowth.controller';
import { ClinigrowthService } from './clinigrowth.service';
import { HisConfigModule } from '../his/config/his-config.module';
import { TenantModule } from '../platform/tenant/tenant.module';

/**
 * CliniGrowth integration (delivery phase). Pediatric growth-chart module —
 * a thin read-only proxy over the hospital's Oracle HIS, no owned database
 * tables of its own (so: no entities, no migrations).
 *
 * Depends only on shared ZoeConnect platform infrastructure —
 * `HisConfigModule` (provides `OraclePoolManager`, the tenant-routed HIS
 * connection pool) and `TenantModule` (for `TenantContextInterceptor`) —
 * never on the Drug Indenting or Mortuary modules. See
 * `ClinigrowthService`'s doc comment for why the source's incidental
 * Drug-Indenting-Oracle-pool reuse was never a real domain dependency.
 */
@Module({
  imports: [HisConfigModule, TenantModule],
  controllers: [ClinigrowthController],
  providers: [ClinigrowthService],
  exports: [],
})
export class ClinigrowthModule {}
