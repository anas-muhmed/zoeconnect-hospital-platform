import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LoyaltyAccount }    from '../loyalty/entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../loyalty/entities/loyalty-transaction.entity';
import { Campaign }          from '../loyalty/entities/campaign.entity';
import { NotificationLog }   from '../notifications/entities/notification-log.entity';
import type {
  DashboardKpis, TierDistributionRow, DailyVolumeRow,
  TopEarnerRow, CampaignPerformanceRow, NotificationStatsRow,
} from './reports.types';

/** INR value of 1 loyalty point — configurable via env */
const POINT_VALUE_INR = Number(process.env.POINT_VALUE_INR ?? 0.25);

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(LoyaltyAccount)    private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTransaction) private readonly txRepo: Repository<LoyaltyTransaction>,
    @InjectRepository(Campaign)          private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(NotificationLog)   private readonly notifRepo: Repository<NotificationLog>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Dashboard KPIs ─────────────────────────────────────────────────────────

  async getDashboardKpis(): Promise<DashboardKpis> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      totalAccounts,
      activeAccounts,
      newEnrollmentsMonth,
      pointsSummary,
      txToday,
      notifToday,
    ] = await Promise.all([
      this.accountRepo.count(),
      this.accountRepo.count({ where: { status: 'ACTIVE' } }),
      this.accountRepo
        .createQueryBuilder('a')
        .where('a.enrolled_at >= :monthStart', { monthStart })
        .getCount(),
      this.accountRepo
        .createQueryBuilder('a')
        .select('SUM(a.available_points)', 'totalPoints')
        .getRawOne<{ totalPoints: string }>(),
      this.txRepo
        .createQueryBuilder('tx')
        .select([
          "COUNT(*) FILTER (WHERE tx.transaction_type = 'EARN')   AS \"earnCount\"",
          "COUNT(*) FILTER (WHERE tx.transaction_type = 'REDEEM') AS \"redeemCount\"",
          "COALESCE(SUM(tx.points_delta) FILTER (WHERE tx.transaction_type = 'EARN'),   0) AS \"pointsEarned\"",
          "COALESCE(SUM(tx.points_delta) FILTER (WHERE tx.transaction_type = 'REDEEM'), 0) AS \"pointsRedeemed\"",
        ])
        .where('tx.created_at >= :todayStart', { todayStart })
        .getRawOne<{
          earnCount: string; redeemCount: string;
          pointsEarned: string; pointsRedeemed: string;
        }>(),
      this.notifRepo
        .createQueryBuilder('n')
        .where("n.status = 'SENT'")
        .andWhere('n.created_at >= :todayStart', { todayStart })
        .getCount(),
    ]);

    const totalPointsOutstanding = parseInt(pointsSummary?.totalPoints ?? '0', 10);

    return {
      totalAccounts,
      activeAccounts,
      newEnrollmentsMonth,
      totalPointsOutstanding,
      estimatedLiabilityInr: Math.round(totalPointsOutstanding * POINT_VALUE_INR * 100) / 100,
      transactionsToday:     parseInt(txToday?.earnCount ?? '0', 10) + parseInt(txToday?.redeemCount ?? '0', 10),
      pointsEarnedToday:     parseInt(txToday?.pointsEarned ?? '0', 10),
      pointsRedeemedToday:   parseInt(txToday?.pointsRedeemed ?? '0', 10),
      notificationsSentToday: notifToday,
    };
  }

  // ── Tier Distribution ──────────────────────────────────────────────────────

  async getTierDistribution(): Promise<TierDistributionRow[]> {
    const rows = await this.accountRepo
      .createQueryBuilder('a')
      .innerJoin('card_categories', 'c', 'c.id = a.card_category_id')
      .select([
        'c.id              AS "tierId"',
        'c.name            AS "tierName"',
        'c.colour_hex      AS "tierColor"',
        'COUNT(a.id)       AS "count"',
        'COALESCE(SUM(a.available_points), 0) AS "totalPoints"',
      ])
      .where("a.status = 'ACTIVE'")
      .groupBy('c.id, c.name, c.colour_hex')
      .orderBy('"count"', 'DESC')
      .getRawMany<{ tierId: string; tierName: string; tierColor: string; count: string; totalPoints: string }>();

    const total = rows.reduce((s, r) => s + parseInt(r.count, 10), 0) || 1;

    return rows.map(r => ({
      tierId:      r.tierId,
      tierName:    r.tierName,
      tierColor:   r.tierColor ?? '#888888',
      count:       parseInt(r.count, 10),
      percentage:  Math.round((parseInt(r.count, 10) / total) * 10000) / 100,
      totalPoints: parseInt(r.totalPoints, 10),
    }));
  }

  // ── Daily Transaction Volume ───────────────────────────────────────────────

  async getDailyVolume(days = 30): Promise<DailyVolumeRow[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .select([
        "TO_CHAR(tx.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date",
        "COUNT(*) FILTER (WHERE tx.transaction_type = 'EARN')   AS \"earnCount\"",
        "COUNT(*) FILTER (WHERE tx.transaction_type = 'REDEEM') AS \"redeemCount\"",
        "COALESCE(SUM(tx.points_delta) FILTER (WHERE tx.transaction_type = 'EARN'),   0) AS \"pointsEarned\"",
        "COALESCE(SUM(tx.points_delta) FILTER (WHERE tx.transaction_type = 'REDEEM'), 0) AS \"pointsRedeemed\"",
        "COALESCE(SUM(tx.bill_amount)  FILTER (WHERE tx.transaction_type = 'EARN'),   0) AS \"totalAmount\"",
      ])
      .where('tx.created_at >= :since', { since })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{
        date: string; earnCount: string; redeemCount: string;
        pointsEarned: string; pointsRedeemed: string; totalAmount: string;
      }>();

    return rows.map(r => ({
      date:           r.date,
      earnCount:      parseInt(r.earnCount,      10),
      redeemCount:    parseInt(r.redeemCount,    10),
      pointsEarned:   parseInt(r.pointsEarned,   10),
      pointsRedeemed: parseInt(r.pointsRedeemed, 10),
      totalAmount:    parseFloat(r.totalAmount),
    }));
  }

  // ── Top Earners ────────────────────────────────────────────────────────────

  async getTopEarners(limit = 20): Promise<TopEarnerRow[]> {
    const rows = await this.accountRepo
      .createQueryBuilder('a')
      .innerJoin('card_categories', 'c', 'c.id = a.card_category_id')
      .select([
        'a.id                    AS "accountId"',
        'a.card_number           AS "cardNumber"',
        'a.patient_mrn           AS "patientMrn"',
        'c.name                  AS "tierName"',
        'c.colour_hex            AS "tierColor"',
        'a.available_points      AS "availablePoints"',
        'a.total_points_earned   AS "lifetimePoints"',
        'a.total_lifetime_spend  AS "totalSpend"',
        "TO_CHAR(a.enrolled_at, 'YYYY-MM-DD') AS \"enrolledAt\"",
      ])
      .where("a.status = 'ACTIVE'")
      .orderBy('a.total_points_earned', 'DESC')
      .limit(limit)
      .getRawMany<{
        accountId: string; cardNumber: string; patientMrn: string;
        tierName: string; tierColor: string;
        availablePoints: string; lifetimePoints: string;
        totalSpend: string; enrolledAt: string;
      }>();

    return rows.map(r => ({
      accountId:       r.accountId,
      cardNumber:      r.cardNumber,
      patientMrn:      r.patientMrn,
      tierName:        r.tierName,
      tierColor:       r.tierColor ?? '#888888',
      availablePoints: parseInt(r.availablePoints, 10),
      lifetimePoints:  parseInt(r.lifetimePoints,  10),
      totalSpend:      parseFloat(r.totalSpend),
      enrolledAt:      r.enrolledAt,
    }));
  }

  // ── Campaign Performance ───────────────────────────────────────────────────

  async getCampaignPerformance(): Promise<CampaignPerformanceRow[]> {
    const rows = await this.campaignRepo
      .createQueryBuilder('c')
      .leftJoin(
        'loyalty_transactions', 'tx',
        "tx.reference_id = c.id::text AND tx.reference_type = 'CAMPAIGN' AND tx.transaction_type = 'EARN'",
      )
      .select([
        'c.id            AS "campaignId"',
        'c.name          AS "campaignName"',
        'c.campaign_type AS "campaignType"',
        'c.is_active     AS "isActive"',
        "TO_CHAR(c.start_date, 'YYYY-MM-DD') AS \"startDate\"",
        "TO_CHAR(c.end_date,   'YYYY-MM-DD') AS \"endDate\"",
        'COUNT(tx.id)                             AS "bonusTransactions"',
        'COALESCE(SUM(tx.points_delta), 0)        AS "totalBonusPoints"',
        'COUNT(DISTINCT tx.account_id)            AS "uniqueAccounts"',
      ])
      .groupBy('c.id, c.name, c.campaign_type, c.is_active, c.start_date, c.end_date')
      .orderBy('"bonusTransactions"', 'DESC')
      .getRawMany<{
        campaignId: string; campaignName: string; campaignType: string;
        isActive: boolean; startDate: string | null; endDate: string | null;
        bonusTransactions: string; totalBonusPoints: string; uniqueAccounts: string;
      }>();

    return rows.map(r => ({
      campaignId:        r.campaignId,
      campaignName:      r.campaignName,
      campaignType:      r.campaignType,
      isActive:          r.isActive,
      startDate:         r.startDate,
      endDate:           r.endDate,
      bonusTransactions: parseInt(r.bonusTransactions, 10),
      totalBonusPoints:  parseInt(r.totalBonusPoints,  10),
      uniqueAccounts:    parseInt(r.uniqueAccounts,    10),
    }));
  }

  // ── Notification Stats ─────────────────────────────────────────────────────

  async getNotificationStats(days = 30): Promise<NotificationStatsRow[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.notifRepo
      .createQueryBuilder('n')
      .select(['n.channel AS channel', 'n.status AS status', 'COUNT(*) AS count'])
      .where('n.created_at >= :since', { since })
      .groupBy('n.channel, n.status')
      .orderBy('count', 'DESC')
      .getRawMany<{ channel: string; status: string; count: string }>();

    return rows.map(r => ({
      channel: r.channel,
      status:  r.status,
      count:   parseInt(r.count, 10),
    }));
  }

  // ── CSV Exports ────────────────────────────────────────────────────────────

  async exportTopEarnersCsv(): Promise<string> {
    const rows = await this.getTopEarners(1000);
    const header = 'Card Number,MRN,Tier,Available Points,Lifetime Points,Total Spend (INR),Enrolled At\n';
    const body = rows
      .map(r =>
        [
          r.cardNumber, r.patientMrn, r.tierName,
          r.availablePoints, r.lifetimePoints,
          r.totalSpend.toFixed(2), r.enrolledAt,
        ].join(','),
      )
      .join('\n');
    return header + body;
  }

  async exportDailyVolumeCsv(days = 30): Promise<string> {
    const rows = await this.getDailyVolume(days);
    const header = 'Date,Earn Transactions,Redeem Transactions,Points Earned,Points Redeemed,Bill Amount (INR)\n';
    const body = rows
      .map(r =>
        [
          r.date, r.earnCount, r.redeemCount,
          r.pointsEarned, r.pointsRedeemed, r.totalAmount.toFixed(2),
        ].join(','),
      )
      .join('\n');
    return header + body;
  }

  async exportCampaignPerformanceCsv(): Promise<string> {
    const rows = await this.getCampaignPerformance();
    const header = 'Campaign Name,Type,Active,Start Date,End Date,Bonus Transactions,Total Bonus Points,Unique Accounts\n';
    const body = rows
      .map(r =>
        [
          `"${r.campaignName}"`, r.campaignType, r.isActive ? 'Yes' : 'No',
          r.startDate ?? '', r.endDate ?? '',
          r.bonusTransactions, r.totalBonusPoints, r.uniqueAccounts,
        ].join(','),
      )
      .join('\n');
    return header + body;
  }
}
