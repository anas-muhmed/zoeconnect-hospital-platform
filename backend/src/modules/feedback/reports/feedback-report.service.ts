import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeedbackSubmission } from '../entities/feedback-submission.entity';
import { FeedbackComplaint } from '../entities/feedback-complaint.entity';
import { FeedbackAnswer } from '../entities/feedback-answer.entity';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

export interface FeedbackReportFilters {
  campaignId?: string;
  formId?: string;
  days?: number;
}

const DEFAULT_RANGE_DAYS = 30;

/** Wraps every field in quotes and doubles embedded quotes -- matches the one existing precedent in the codebase that actually escapes correctly (TokenAnalyticsController.export), rather than the older ad-hoc reports.service.ts CSV builders that only quote a couple of known-risky columns. */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  return `"${String(v).replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

/**
 * CSV exports over the same data the Analytics Dashboard aggregates --
 * this phase is the "give me the raw rows" counterpart to that phase's
 * "give me the rollup". Deliberately three separate exports rather than
 * one mega-export, since a submissions summary, a complaint list, and a
 * per-question answer breakdown are genuinely different shapes admins
 * pull into Excel for different reasons.
 */
@Injectable()
export class FeedbackReportService {
  constructor(
    @InjectRepository(FeedbackSubmission)
    private readonly submissionRepo: Repository<FeedbackSubmission>,
    @InjectRepository(FeedbackComplaint)
    private readonly complaintRepo: Repository<FeedbackComplaint>,
    @InjectRepository(FeedbackAnswer)
    private readonly answerRepo: Repository<FeedbackAnswer>,
    @InjectRepository(FeedbackCampaign)
    private readonly campaignRepo: Repository<FeedbackCampaign>,
    @InjectRepository(FeedbackForm)
    private readonly formRepo: Repository<FeedbackForm>,

    /**
     * Stage B (Checkpoint B3.7) — scoped repositories for all three CSV
     * exports and their shared `_lookupNames()` helper. All are
     * session-resolved-only (`FeedbackReportController`, fully guarded, no
     * public route exports report data).
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackSubmission))
    private readonly scopedSubmissionRepo: TenantScopedRepository<FeedbackSubmission>,
    @Inject(getTenantScopedRepositoryToken(FeedbackComplaint))
    private readonly scopedComplaintRepo: TenantScopedRepository<FeedbackComplaint>,
    @Inject(getTenantScopedRepositoryToken(FeedbackAnswer))
    private readonly scopedAnswerRepo: TenantScopedRepository<FeedbackAnswer>,
    @Inject(getTenantScopedRepositoryToken(FeedbackCampaign))
    private readonly scopedCampaignRepo: TenantScopedRepository<FeedbackCampaign>,
    @Inject(getTenantScopedRepositoryToken(FeedbackForm))
    private readonly scopedFormRepo: TenantScopedRepository<FeedbackForm>,
  ) {}

  private _since(days?: number): Date {
    const d = days && days > 0 ? days : DEFAULT_RANGE_DAYS;
    return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  }

  private async _lookupNames(campaignIds: string[], formIds: string[]) {
    const campaigns = campaignIds.length ? await this.scopedCampaignRepo.findBy({ id: In(campaignIds) }) : [];
    const forms = formIds.length ? await this.scopedFormRepo.findBy({ id: In(formIds) }) : [];
    return {
      campaignName: new Map(campaigns.map(c => [c.id, c.name])),
      formName: new Map(forms.map(f => [f.id, f.name])),
    };
  }

  async exportSubmissionsCsv(branchId: string | null, filters: FeedbackReportFilters): Promise<string> {
    const qb = (await this.scopedSubmissionRepo.createQueryBuilder('s')).where('s.submitted_at >= :since', { since: this._since(filters.days) });
    if (branchId) qb.andWhere('s.branch_id = :branchId', { branchId });
    if (filters.campaignId) qb.andWhere('s.campaign_id = :campaignId', { campaignId: filters.campaignId });
    if (filters.formId) qb.andWhere('s.form_id = :formId', { formId: filters.formId });
    const submissions = await qb.orderBy('s.submitted_at', 'DESC').getMany();

    const { campaignName, formName } = await this._lookupNames(
      [...new Set(submissions.map(s => s.campaignId))],
      [...new Set(submissions.map(s => s.formId))],
    );

    return toCsv(
      ['Submission ID', 'Campaign', 'Form', 'Overall Rating', 'Status', 'Language', 'Submitted At'],
      submissions.map(s => [
        s.id,
        campaignName.get(s.campaignId) ?? 'Unknown campaign',
        formName.get(s.formId) ?? 'Unknown form',
        s.overallRating ?? '',
        s.status,
        s.language ?? '',
        s.submittedAt.toISOString(),
      ]),
    );
  }

  async exportComplaintsCsv(branchId: string | null, filters: FeedbackReportFilters): Promise<string> {
    const qb = (await this.scopedComplaintRepo.createQueryBuilder('c')).where('c.created_at >= :since', { since: this._since(filters.days) });
    if (branchId) qb.andWhere('c.branch_id = :branchId', { branchId });
    if (filters.campaignId) qb.andWhere('c.campaign_id = :campaignId', { campaignId: filters.campaignId });
    if (filters.formId) qb.andWhere('c.form_id = :formId', { formId: filters.formId });
    const complaints = await qb.orderBy('c.created_at', 'DESC').getMany();

    const { campaignName } = await this._lookupNames([...new Set(complaints.map(c => c.campaignId))], []);

    return toCsv(
      ['Complaint ID', 'Campaign', 'Category', 'Description', 'Status', 'Assigned To', 'Contact Name', 'Contact Phone', 'Contact Email', 'Created At', 'Resolved At'],
      complaints.map(c => [
        c.id,
        campaignName.get(c.campaignId) ?? 'Unknown campaign',
        c.category,
        c.description,
        c.status,
        c.assignedTo ?? '',
        c.contactName ?? '',
        c.contactPhone ?? '',
        c.contactEmail ?? '',
        c.createdAt.toISOString(),
        c.resolvedAt ? c.resolvedAt.toISOString() : '',
      ]),
    );
  }

  /** One row per answer (not per submission) -- lets an admin pivot in Excel across whichever questions they care about, since forms have a variable number of questions and a fixed-column export can't represent that. */
  async exportAnswersCsv(branchId: string | null, filters: FeedbackReportFilters): Promise<string> {
    const submissionQb = (await this.scopedSubmissionRepo.createQueryBuilder('s')).where('s.submitted_at >= :since', { since: this._since(filters.days) });
    if (branchId) submissionQb.andWhere('s.branch_id = :branchId', { branchId });
    if (filters.campaignId) submissionQb.andWhere('s.campaign_id = :campaignId', { campaignId: filters.campaignId });
    if (filters.formId) submissionQb.andWhere('s.form_id = :formId', { formId: filters.formId });
    const submissions = await submissionQb.getMany();
    if (submissions.length === 0) {
      return toCsv(['Submission ID', 'Campaign', 'Form', 'Submitted At', 'Question', 'Answer'], []);
    }

    const submissionById = new Map(submissions.map(s => [s.id, s]));
    const { campaignName, formName } = await this._lookupNames(
      [...new Set(submissions.map(s => s.campaignId))],
      [...new Set(submissions.map(s => s.formId))],
    );

    const answers = await this.scopedAnswerRepo.find({
      where: { submissionId: In(submissions.map(s => s.id)) },
      order: { submissionId: 'ASC' },
    });

    return toCsv(
      ['Submission ID', 'Campaign', 'Form', 'Submitted At', 'Question', 'Answer'],
      answers.map(a => {
        const s = submissionById.get(a.submissionId);
        return [
          a.submissionId,
          s ? (campaignName.get(s.campaignId) ?? 'Unknown campaign') : '',
          s ? (formName.get(s.formId) ?? 'Unknown form') : '',
          s ? s.submittedAt.toISOString() : '',
          a.questionTextSnapshot,
          a.displayValue ?? (Array.isArray(a.value) ? a.value.join(', ') : String(a.value ?? '')),
        ];
      }),
    );
  }
}
