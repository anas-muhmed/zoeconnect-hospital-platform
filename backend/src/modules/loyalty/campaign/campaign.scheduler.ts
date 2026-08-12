import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../entities/loyalty-transaction.entity';
import { CampaignService } from './campaign.service';
import { TransactionService } from '../services/transaction.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class CampaignScheduler {
  private readonly logger = new Logger(CampaignScheduler.name);

  constructor(
    @InjectRepository(LoyaltyAccount) private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTransaction) private readonly txRepo: Repository<LoyaltyTransaction>,
    private readonly campaignService: CampaignService,
    private readonly transactionService: TransactionService,
  ) {}

  // ── Run daily at 08:00 IST (02:30 UTC) ──────────────────────────────────
  @Cron('30 2 * * *', { name: 'birthday-campaign', timeZone: 'Asia/Kolkata' })
  async runBirthdayCampaign(): Promise<void> {
    this.logger.log('Running birthday campaign job…');

    const campaigns = await this.campaignService.getActiveBirthdayCampaigns();
    if (campaigns.length === 0) {
      this.logger.log('No active birthday campaigns — skipping');
      return;
    }

    const now = new Date();
    const todayMonth = now.getMonth() + 1; // 1-12
    const todayDay   = now.getDate();       // 1-31

    // Find accounts whose birthday matches today (derived from patient_dob DATE column)
    const accounts = await this.accountRepo
      .createQueryBuilder('a')
      .where("EXTRACT(MONTH FROM a.patient_dob) = :month", { month: todayMonth })
      .andWhere("EXTRACT(DAY   FROM a.patient_dob) = :day",   { day:   todayDay })
      .andWhere("a.status = 'ACTIVE'")
      .andWhere("a.patient_dob IS NOT NULL")
      .getMany();

    if (accounts.length === 0) {
      this.logger.log(`No birthdays today (${todayMonth}/${todayDay})`);
      return;
    }

    const thisYear = now.getFullYear();
    let posted = 0;
    let skipped = 0;

    for (const account of accounts) {
      for (const campaign of campaigns) {
        const bonusPts = Number(campaign.bonusPointsFlat) > 0 ? Number(campaign.bonusPointsFlat) : 100; // default 100 birthday pts

        // Idempotency: check if bonus was already posted this year for this campaign
        const alreadyPosted = await this.txRepo
          .createQueryBuilder('tx')
          .where('tx.account_id = :accountId', { accountId: account.id })
          .andWhere("tx.transaction_type = 'EARN'")
          .andWhere("tx.reference_type = 'CAMPAIGN'")
          .andWhere('tx.reference_id = :campaignId', { campaignId: campaign.id })
          .andWhere('EXTRACT(YEAR FROM tx.created_at) = :year', { year: thisYear })
          .getCount();

        if (alreadyPosted > 0) {
          skipped++;
          continue;
        }

        try {
          // Phase 8 (Task 8.6): postCampaignBonus() stamps the new
          // LoyaltyTransaction's tenantId via
          // TenantContextStorage.currentTenantIdOrNull(), which resolves to
          // null with no ambient context -- true for every @Cron job.
          // Establish it explicitly here, per-account, from the account's
          // own already-stamped tenantId (the account row is the source of
          // truth for "which tenant does this bonus belong to", not a
          // separate active-tenants query). `null` (pre-Phase-8 accounts,
          // or self-hosted) falls through unchanged -- same as before.
          const postBonus = () =>
            this.transactionService.postCampaignBonus(
              account.id,
              bonusPts,
              campaign.id,
              campaign.name,
            );
          if (account.tenantId) {
            await TenantContextStorage.run(account.tenantId, postBonus);
          } else {
            await postBonus();
          }
          posted++;
          this.logger.log(
            `Birthday bonus: ${bonusPts} pts → account ${account.cardNumber} (campaign: ${campaign.name})`,
          );
        } catch (err) {
          this.logger.error(
            `Failed birthday bonus for ${account.cardNumber}: ${(err as Error).message}`,
          );
        }
      }
    }

    this.logger.log(
      `Birthday campaign complete — posted: ${posted}, skipped (already received): ${skipped}`,
    );
  }

  // ── Run daily at 00:05 IST to expire ended campaigns ────────────────────
  @Cron('35 18 * * *', { name: 'campaign-expiry', timeZone: 'UTC' })
  async expireCampaigns(): Promise<void> {
    const count = await this.campaignService.deactivateExpired();
    if (count > 0) this.logger.log(`Expired ${count} campaigns`);
  }
}
