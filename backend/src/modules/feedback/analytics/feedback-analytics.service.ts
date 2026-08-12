import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeedbackSubmission } from '../entities/feedback-submission.entity';
import { FeedbackComplaint } from '../entities/feedback-complaint.entity';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

export interface FeedbackAnalyticsDashboard {
  rangeDays: number;
  totalSubmissions: number;
  averageRating: number | null;
  ratingDistribution: { rating: number; count: number }[];
  submissionsTrend: { date: string; count: number; avgRating: number | null }[];
  campaignBreakdown: { campaignId: string; campaignName: string; count: number; avgRating: number | null }[];
  complaints: {
    total: number;
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
  };
}

const DEFAULT_RANGE_DAYS = 30;

/**
 * Read-only aggregate queries over submissions/complaints -- the analytics
 * dashboard phase of the module. Deliberately a single "dashboard" payload
 * rather than N separate chart endpoints, since every chart on the page
 * shares the same filters (branch/campaign/form/date-range) and the admin
 * views it as one screen; a proper report *builder* (arbitrary breakdowns,
 * export) is still a later phase, this is a fixed set of the most useful
 * views.
 *
 * Every raw QueryBuilder expression here uses the actual snake_case DB
 * column names (`overall_rating`, `submitted_at`, ...), not the entity's
 * camelCase TS properties -- matching this codebase's established
 * convention (see ReportsService.getTierDistribution) rather than relying
 * on TypeORM's property-name translation inside arbitrary raw SQL
 * fragments, which isn't reliably applied inside function calls like
 * `AVG(...)`/`ROUND(...)`. Result aliases are still camelCase, quoted
 * (`AS "avgRating"`) so Postgres preserves the case in the raw rows.
 */
@Injectable()
export class FeedbackAnalyticsService {
  constructor(
    @InjectRepository(FeedbackSubmission)
    private readonly submissionRepo: Repository<FeedbackSubmission>,
    @InjectRepository(FeedbackComplaint)
    private readonly complaintRepo: Repository<FeedbackComplaint>,
    @InjectRepository(FeedbackCampaign)
    private readonly campaignRepo: Repository<FeedbackCampaign>,

    /**
     * Stage B (Checkpoint B3.7) — scoped repositories for `getDashboard()`,
     * session-resolved-only (`FeedbackAnalyticsController`, no public route).
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackSubmission))
    private readonly scopedSubmissionRepo: TenantScopedRepository<FeedbackSubmission>,
    @Inject(getTenantScopedRepositoryToken(FeedbackComplaint))
    private readonly scopedComplaintRepo: TenantScopedRepository<FeedbackComplaint>,
    @Inject(getTenantScopedRepositoryToken(FeedbackCampaign))
    private readonly scopedCampaignRepo: TenantScopedRepository<FeedbackCampaign>,
  ) {}

  async getDashboard(
    branchId: string | null,
    filters: { campaignId?: string; formId?: string; days?: number },
  ): Promise<FeedbackAnalyticsDashboard> {
    const days = filters.days && filters.days > 0 ? filters.days : DEFAULT_RANGE_DAYS;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // `TenantScopedRepository.createQueryBuilder()` is async (it needs to
    // resolve the current tenant before it can safely hand back a scoped
    // builder -- see that class's own doc comment on why there is no
    // unscoped escape). These helpers were written as if it were sync;
    // made async and every call site below now awaits them.
    const submissionsQb = async () => {
      const qb = (await this.scopedSubmissionRepo.createQueryBuilder('s')).where('s.submitted_at >= :since', { since });
      if (branchId) qb.andWhere('s.branch_id = :branchId', { branchId });
      if (filters.campaignId) qb.andWhere('s.campaign_id = :campaignId', { campaignId: filters.campaignId });
      if (filters.formId) qb.andWhere('s.form_id = :formId', { formId: filters.formId });
      return qb;
    };
    const complaintsQb = async () => {
      const qb = (await this.scopedComplaintRepo.createQueryBuilder('c')).where('c.created_at >= :since', { since });
      if (branchId) qb.andWhere('c.branch_id = :branchId', { branchId });
      if (filters.campaignId) qb.andWhere('c.campaign_id = :campaignId', { campaignId: filters.campaignId });
      if (filters.formId) qb.andWhere('c.form_id = :formId', { formId: filters.formId });
      return qb;
    };

    const totalsRaw = await (await submissionsQb())
      .select('COUNT(*)', 'total')
      .addSelect('AVG(s.overall_rating)', 'avgRating')
      .getRawOne<{ total: string; avgRating: string | null }>();

    const distributionRaw = await (await submissionsQb())
      .andWhere('s.overall_rating IS NOT NULL')
      .select('ROUND(s.overall_rating)', 'rating')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ROUND(s.overall_rating)')
      .getRawMany<{ rating: string; count: string }>();
    // Always return all five buckets (even zero-count) so the chart's x-axis doesn't jump around.
    const distributionByRating = new Map(distributionRaw.map((r: { rating: string; count: string }) => [Number(r.rating), Number(r.count)]));
    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({ rating, count: distributionByRating.get(rating) ?? 0 }));

    const trendRaw = await (await submissionsQb())
      .select("TO_CHAR(s.submitted_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(s.overall_rating)', 'avgRating')
      .groupBy("TO_CHAR(s.submitted_at, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(s.submitted_at, 'YYYY-MM-DD')", 'ASC')
      .getRawMany<{ date: string; count: string; avgRating: string | null }>();
    const submissionsTrend = trendRaw.map((r: { date: string; count: string; avgRating: string | null }) => ({
      date: r.date,
      count: Number(r.count),
      avgRating: r.avgRating !== null && r.avgRating !== undefined ? Math.round(Number(r.avgRating) * 100) / 100 : null,
    }));

    const campaignRaw = await (await submissionsQb())
      .select('s.campaign_id', 'campaignId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(s.overall_rating)', 'avgRating')
      .groupBy('s.campaign_id')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ campaignId: string; count: string; avgRating: string | null }>();
    const campaignIds: string[] = campaignRaw.map((r: { campaignId: string }) => r.campaignId);
    const campaigns = campaignIds.length ? await this.scopedCampaignRepo.findBy({ id: In(campaignIds) }) : [];
    const campaignNameById = new Map(campaigns.map(c => [c.id, c.name]));
    const campaignBreakdown = campaignRaw.map((r: { campaignId: string; count: string; avgRating: string | null }) => ({
      campaignId: r.campaignId,
      campaignName: campaignNameById.get(r.campaignId) ?? 'Unknown campaign',
      count: Number(r.count),
      avgRating: r.avgRating !== null && r.avgRating !== undefined ? Math.round(Number(r.avgRating) * 100) / 100 : null,
    }));

    const complaintTotal = await (await complaintsQb()).getCount();
    const complaintByStatusRaw = await (await complaintsQb())
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany<{ status: string; count: string }>();
    const complaintByCategoryRaw = await (await complaintsQb())
      .select('c.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.category')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ category: string; count: string }>();

    return {
      rangeDays: days,
      totalSubmissions: Number(totalsRaw?.total ?? 0),
      averageRating: totalsRaw?.avgRating !== null && totalsRaw?.avgRating !== undefined
        ? Math.round(Number(totalsRaw.avgRating) * 100) / 100
        : null,
      ratingDistribution,
      submissionsTrend,
      campaignBreakdown,
      complaints: {
        total: complaintTotal,
        byStatus: complaintByStatusRaw.map((r: { status: string; count: string }) => ({ status: r.status, count: Number(r.count) })),
        byCategory: complaintByCategoryRaw.map((r: { category: string; count: string }) => ({ category: r.category, count: Number(r.count) })),
      },
    };
  }
}
