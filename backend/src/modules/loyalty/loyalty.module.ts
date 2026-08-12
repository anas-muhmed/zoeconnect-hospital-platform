import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { LoyaltyController }      from './loyalty.controller';
import { LoyaltyProcessor }       from './loyalty.processor';
import { EnrollmentService }      from './services/enrollment.service';
import { TransactionService }     from './services/transaction.service';
import { RedemptionService }      from './services/redemption.service';
import { PointEngineService }     from './services/point-engine.service';
import { CardConfigService }      from './services/card-config.service';
import { CampaignService }        from './campaign/campaign.service';
import { CampaignController }     from './campaign/campaign.controller';
import { CampaignScheduler }      from './campaign/campaign.scheduler';
import { LoyaltyAccount }         from './entities/loyalty-account.entity';
import { LoyaltyTransaction }     from './entities/loyalty-transaction.entity';
import { CardCategory }           from './entities/card-category.entity';
import { Campaign }               from './entities/campaign.entity';
import { RewardCatalog }          from './entities/reward-catalog.entity';
import { RewardRedemption }       from './entities/reward-redemption.entity';
import { AuditModule }            from '../audit/audit.module';
import { LicensingModule }        from '../licensing/license.module';
import { HisModule }              from '../his/his.module';
import { NotificationModule }     from '../notifications/notification.module';
import { QUEUE_NAMES }            from '../../config/redis.config';
import { TenantModule }           from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

/**
 * Stage B (Checkpoint B3.4) — per the B3 Eligibility Rule, `TenantScopedRepository`
 * (dry-run) is added for all 6 Loyalty entities, alongside the existing raw
 * repositories. Only these read-backing methods are converted:
 *   CardConfigService.findAll()/findOne(), EnrollmentService.listAccounts(),
 *   TransactionService.getTransactions(), RedemptionService.getCatalog()/getRedemptions(),
 *   CampaignService.findAll()/getActiveCampaigns()/findOne().
 * Excluded (fail the eligibility test — shared with async/write infrastructure):
 * EnrollmentService.getAccountById()/getAccountByMrn()/getAccountByCard() (also
 * reached from the birthday-campaign cron, the HIS-sync path, and the
 * earn-from-bill BullMQ processor respectively). Every write path, plus
 * CardConfigService.recalculateTiers() (a write, not a read), stays on the
 * raw repositories. See the B3.4 pre-flight in `HYBRID_ARCHITECTURE_LOG.md`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyAccount,
      LoyaltyTransaction,
      CardCategory,
      Campaign,
      RewardCatalog,
      RewardRedemption,
    ]),
    BullModule.registerQueue({ name: QUEUE_NAMES.LOYALTY_EVENTS }),
    AuditModule,
    LicensingModule,
    HisModule,
    NotificationModule,
    TenantModule,
  ],
  controllers: [LoyaltyController, CampaignController],
  providers: [
    EnrollmentService,
    TransactionService,
    RedemptionService,
    PointEngineService,
    CardConfigService,
    LoyaltyProcessor,
    CampaignService,
    CampaignScheduler,
    // HisLoyaltyBridgeService is NOT listed here — it is exported by HisModule
    // (which this module imports) so it is already available in this context.
    // Declaring it again here causes double-registration and @Optional() resolves to null.
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
    // audit/fix pass triggered by the confirmed Users cross-tenant leak — see
    // HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
    createTenantScopedRepositoryProvider(LoyaltyAccount,     { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(LoyaltyTransaction, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CardCategory,       { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(Campaign,           { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(RewardCatalog,      { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(RewardRedemption,   { mode: 'enforced' }),
  ],
  exports: [EnrollmentService, TransactionService, RedemptionService, PointEngineService, CampaignService, CardConfigService],
})
export class LoyaltyModule {}
