import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedbackSubmission } from '../entities/feedback-submission.entity';
import { FeedbackAnswer } from '../entities/feedback-answer.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

@Injectable()
export class FeedbackResponseService {
  constructor(
    @InjectRepository(FeedbackSubmission)
    private readonly submissionRepo: Repository<FeedbackSubmission>,
    @InjectRepository(FeedbackAnswer)
    private readonly answerRepo: Repository<FeedbackAnswer>,

    /**
     * Stage B (Checkpoint B3.7) — scoped repositories for `list()`/`findOne()`
     * only. `FeedbackComplaintService.submitPublic()` (chain-resolved) reads
     * `FeedbackSubmission` via its own direct `submissionRepo.findOne()`, not
     * through this service, so there's no shared call site. `FeedbackPublicService.submit()`
     * writes both entities directly, also bypassing this service entirely.
     */
    @Inject(getTenantScopedRepositoryToken(FeedbackSubmission))
    private readonly scopedSubmissionRepo: TenantScopedRepository<FeedbackSubmission>,
    @Inject(getTenantScopedRepositoryToken(FeedbackAnswer))
    private readonly scopedAnswerRepo: TenantScopedRepository<FeedbackAnswer>,
  ) {}

  private static readonly SUBMISSION_SELECT = [
    'id', 'branchId', 'formId', 'campaignId', 'qrCodeId', 'anonymousId', 'overallRating',
    'status', 'userAgent', 'ipHash', 'language', 'submittedAt',
  ] as const;

  private static readonly ANSWER_SELECT = [
    'id', 'submissionId', 'questionId', 'questionTextSnapshot', 'questionType', 'value', 'displayValue',
  ] as const;

  // A5.5 API Contract Audit: admin GET /feedback/responses -- explicit select excludes tenantId.
  async list(branchId?: string | null, formId?: string, campaignId?: string): Promise<FeedbackSubmission[]> {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (formId) where.formId = formId;
    if (campaignId) where.campaignId = campaignId;
    return this.scopedSubmissionRepo.find({
      where, order: { submittedAt: 'DESC' }, take: 500, select: [...FeedbackResponseService.SUBMISSION_SELECT],
    });
  }

  // A5.5 API Contract Audit: admin GET /feedback/responses/:id -- explicit select excludes tenantId on both submission and answers.
  async findOne(id: string): Promise<{ submission: FeedbackSubmission; answers: FeedbackAnswer[] }> {
    const submission = await this.scopedSubmissionRepo.findOne({
      where: { id }, select: [...FeedbackResponseService.SUBMISSION_SELECT],
    });
    if (!submission) throw new NotFoundException(`Submission "${id}" not found`);
    const answers = await this.scopedAnswerRepo.find({
      where: { submissionId: id }, select: [...FeedbackResponseService.ANSWER_SELECT],
    });
    return { submission, answers };
  }
}
