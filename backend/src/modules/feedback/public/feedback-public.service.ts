import { Injectable, NotFoundException, GoneException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { FeedbackQrCode } from '../entities/feedback-qr-code.entity';
import { FeedbackCampaign } from '../entities/feedback-campaign.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackQuestion } from '../entities/feedback-question.entity';
import { FeedbackSubmission } from '../entities/feedback-submission.entity';
import { FeedbackAnswer } from '../entities/feedback-answer.entity';
import { FeedbackFormService } from '../forms/feedback-form.service';
import { SubmitFeedbackDto } from '../dto/feedback-submission.dto';
import { SubmitComplaintDto } from '../dto/feedback-complaint.dto';
import { OPTION_BASED_QUESTION_TYPES, FeedbackQuestionType } from '../entities/feedback-question-type.enum';
import { FeedbackAuditService } from '../audit/feedback-audit.service';
import { FeedbackComplaintService } from '../complaints/feedback-complaint.service';
import { FeedbackComplaint } from '../entities/feedback-complaint.entity';
import { FeedbackTranslationService } from '../translations/feedback-translation.service';
import { FeedbackSettingsService } from '../settings/feedback-settings.service';
import { FeedbackSettings } from '../entities/feedback-settings.entity';
import { ChainTenantResolver } from '../../platform/tenant/resolvers/chain-tenant.resolver';

/** Question types whose numeric value feeds the denormalized submission.overallRating (used by the future Google Review threshold check). */
const RATING_QUESTION_TYPES = new Set<string>([
  FeedbackQuestionType.STAR_RATING,
  FeedbackQuestionType.EMOJI_RATING,
  FeedbackQuestionType.NPS_SCORE,
]);

@Injectable()
export class FeedbackPublicService {
  constructor(
    @InjectRepository(FeedbackQrCode)
    private readonly qrRepo: Repository<FeedbackQrCode>,
    @InjectRepository(FeedbackCampaign)
    private readonly campaignRepo: Repository<FeedbackCampaign>,
    @InjectRepository(FeedbackQuestion)
    private readonly questionRepo: Repository<FeedbackQuestion>,
    @InjectRepository(FeedbackSubmission)
    private readonly submissionRepo: Repository<FeedbackSubmission>,
    @InjectRepository(FeedbackAnswer)
    private readonly answerRepo: Repository<FeedbackAnswer>,
    private readonly formService: FeedbackFormService,
    private readonly auditService: FeedbackAuditService,
    private readonly complaintService: FeedbackComplaintService,
    private readonly translationService: FeedbackTranslationService,
    private readonly settingsService: FeedbackSettingsService,
    // Stage B (Checkpoint B5) — this controller has no @UseGuards() at all
    // (fully anonymous QR-scan traffic), so there is no request.user for
    // TenantContextInterceptor to key off. Tenant must be resolved directly
    // here, server-side, from the QR->branch chain already enforced by
    // _resolveChain() — never trusted from client input.
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  /** Resolves QR token -> campaign -> form, enforcing every "is this thing actually still live" check in one place. */
  private async _resolveChain(token: string): Promise<{ qr: FeedbackQrCode; campaign: FeedbackCampaign; form: FeedbackForm }> {
    const qr = await this.qrRepo.findOne({ where: { token } });
    if (!qr) throw new NotFoundException('This feedback link is invalid');
    if (!qr.isActive) throw new GoneException('This feedback link has been disabled');
    if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) throw new GoneException('This feedback link has expired');

    const campaign = await this.campaignRepo.findOne({ where: { id: qr.campaignId } });
    if (!campaign || !campaign.isActive) throw new GoneException('This feedback campaign is no longer active');

    const form = await this.formService.findOne(campaign.formId);
    if (form.status !== 'PUBLISHED') throw new GoneException('This feedback form is not currently available');

    return { qr, campaign, form };
  }

  /**
   * Public, no-login: returns just enough of the form tree to render the
   * portal (sections/questions/options/conditions). Does NOT issue an
   * anonymousId anymore -- it used to hand out a fresh random one on every
   * call, which reset on every page load and so could never actually
   * identify "the same device" across visits, defeating the submission
   * cap in `_enforceSubmissionLimit`. The frontend now generates its own
   * persistent id (stored in localStorage) and sends that at submit time.
   *
   * `lang` (optional) selects a translated overlay of the form's text --
   * see FeedbackTranslationService.applyTranslations. Falls back silently
   * to the form's own authored language if `lang` doesn't match any saved
   * translation (never errors on an unrecognized/missing language). The
   * response also lists `availableLanguages` so the portal can offer a
   * language switcher only when there's actually something to switch to.
   */
  async resolve(token: string, lang?: string) {
    const { qr, form } = await this._resolveChain(token);
    const settings = await this.settingsService.get(qr.branchId);
    const availableLanguages = await this.translationService.getAvailableLanguages(form);
    const selectedLanguage = lang && availableLanguages.some(l => l.code === lang) ? lang : form.language;
    const localized = await this.translationService.applyTranslations(form, selectedLanguage);

    return {
      formId: localized.id,
      name: localized.name,
      description: localized.description,
      language: form.language,
      selectedLanguage,
      availableLanguages,
      headerImageUrl: localized.headerImageUrl,
      headerImageType: localized.headerImageType,
      splashImageUrl: localized.splashImageUrl,
      splashDurationSeconds: localized.splashDurationSeconds,
      sections: localized.sections,
      complaintCategories: settings.complaintCategories,
    };
  }

  async submit(token: string, dto: SubmitFeedbackDto, meta: { userAgent?: string | null; ipHash?: string | null }) {
    const { qr, campaign, form } = await this._resolveChain(token);
    const settings = await this.settingsService.get(qr.branchId);

    if (dto.anonymousId) {
      const duplicateWindowMs = settings.duplicateSubmissionWindowSeconds * 1000;
      const recentDuplicate = await this.submissionRepo.findOne({
        where: {
          qrCodeId: qr.id,
          anonymousId: dto.anonymousId,
          submittedAt: MoreThan(new Date(Date.now() - duplicateWindowMs)),
        },
      });
      if (recentDuplicate) {
        throw new BadRequestException('This feedback was already submitted moments ago');
      }
    }

    await this._enforceSubmissionLimit(campaign.id, dto.anonymousId, meta.ipHash, settings);

    const allQuestions = (form.sections ?? []).flatMap(s => s.questions ?? []);
    const questionsById = new Map(allQuestions.map(q => [q.id, q]));
    const answersByQuestionId = new Map(dto.answers.map(a => [a.questionId, a.value]));

    for (const question of allQuestions) {
      const value = answersByQuestionId.get(question.id);
      if (question.isRequired && (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
        throw new BadRequestException(`"${question.questionText}" is required`);
      }
    }
    for (const answer of dto.answers) {
      const question = questionsById.get(answer.questionId);
      if (!question) throw new BadRequestException(`Question "${answer.questionId}" does not belong to this form`);
      if (OPTION_BASED_QUESTION_TYPES.has(question.questionType as FeedbackQuestionType)) {
        const allowedValues = new Set((question.options ?? []).map(o => o.value));
        const values = Array.isArray(answer.value) ? answer.value : [answer.value];
        for (const v of values) {
          if (v !== undefined && v !== null && v !== '' && !allowedValues.has(String(v))) {
            throw new BadRequestException(`"${v}" is not a valid option for "${question.questionText}"`);
          }
        }
      }
    }

    const ratingValues: number[] = [];
    for (const question of allQuestions) {
      if (!RATING_QUESTION_TYPES.has(question.questionType)) continue;
      const value = answersByQuestionId.get(question.id);
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(num)) ratingValues.push(num);
    }
    const overallRating = ratingValues.length > 0
      ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) * 100) / 100
      : null;

    // CRITICAL FIX (production incident, 2026-08): `qr` (loaded above by
    // _resolveChain(), from qrRepo.findOne({where:{token}})) already
    // carries the CORRECT tenantId -- FeedbackQrService.create() stamps it
    // from the authenticated admin's real session at QR-generation time
    // (feedback-qr.service.ts:85, `tenantContext.currentTenantIdOrNull()`).
    // Using it directly here, instead of re-deriving tenant through
    // ChainTenantResolver.resolveDefaultTenantIgnoringBranch() (which -- see that
    // class's own doc comment -- is currently just an unconditional alias
    // for the platform's single seeded 'default' tenant, regardless of the
    // branchId passed in), is the actual fix: every public submission was
    // being mis-stamped to the 'default' tenant instead of the submitting
    // hospital's real tenant, making it permanently invisible to that
    // hospital's admin Responses page (which reads through a tenant-scoped
    // repository keyed off the admin's own JWT tenantId). The resolver
    // call is kept ONLY as an explicit fallback for legacy QR codes minted
    // before tenant stamping existed (qr.tenantId === null) -- see
    // ChainTenantResolver's own doc comment for why that fallback still
    // returns 'default' rather than a real per-branch resolution today.
    let tenantId: string;
    if (qr.tenantId) {
      tenantId = qr.tenantId;
    } else {
      tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(qr.branchId);
    }

    const submission = await this.submissionRepo.save(this.submissionRepo.create({
      branchId: qr.branchId,
      formId: form.id,
      campaignId: campaign.id,
      qrCodeId: qr.id,
      anonymousId: dto.anonymousId ?? null,
      overallRating,
      status: 'RECEIVED',
      userAgent: meta.userAgent ?? null,
      ipHash: meta.ipHash ?? null,
      language: dto.language ?? form.language,
      tenantId,
    }));

    for (const answer of dto.answers) {
      const question = questionsById.get(answer.questionId);
      if (!question) continue;
      await this.answerRepo.save(this.answerRepo.create({
        submissionId: submission.id,
        questionId: question.id,
        questionTextSnapshot: question.questionText,
        questionType: question.questionType,
        value: answer.value,
        displayValue: this._computeDisplayValue(question, answer.value),
        tenantId,
      }));
    }

    await this.auditService.log({
      entityType: 'feedback_submission', entityId: submission.id, action: 'CREATE',
      changedBy: 'public', branchId: qr.branchId, summary: `Submission received for form "${form.name}" via campaign "${campaign.name}"`,
      tenantId,
    });

    return {
      submissionId: submission.id,
      ...this._buildPostSubmitResponse(campaign, overallRating, settings),
    };
  }

  /**
   * Decides what the public portal shows right after a submission succeeds.
   * If the campaign has the Google Review prompt enabled, a URL is
   * configured, and the patient's overall rating met the threshold: tell
   * the frontend to show the "Share on Google" screen with the configured
   * (or default) copy. Otherwise, if there *was* a rating and it fell
   * below the threshold, show the complaint/suggestion opt-in screen
   * instead -- this is the "later phase" the Google Review spec deferred
   * to, now built (see FeedbackComplaintService). A submission with no
   * rating question at all gets neither prompt, just the plain thank-you.
   */
  private _buildPostSubmitResponse(campaign: FeedbackCampaign, overallRating: number | null, settings: FeedbackSettings) {
    const threshold = Number(campaign.googleReviewThreshold ?? settings.defaultGoogleReviewThreshold);
    const meetsThreshold = overallRating !== null && overallRating >= threshold;
    const showGoogleReview = campaign.googleReviewEnabled && !!campaign.googleReviewUrl && meetsThreshold;
    const showComplaintPrompt = !showGoogleReview && overallRating !== null && overallRating < threshold;

    return {
      thankYouMessage: campaign.googleReviewThankYouMessage || settings.defaultThankYouMessage,
      showGoogleReview,
      googleReview: showGoogleReview
        ? {
            url: campaign.googleReviewUrl as string,
            thankYouMessage: campaign.googleReviewThankYouMessage || settings.defaultGoogleReviewThankYouMessage,
            invitationMessage: campaign.googleReviewInvitationMessage || settings.defaultGoogleReviewInvitationMessage,
          }
        : null,
      showComplaintPrompt,
    };
  }

  /**
   * Public complaint submission -- only reachable after a real submission
   * exists (the patient opts in from the low-rating screen). Resolves the
   * token fresh rather than trusting anything the client sends beyond the
   * token + submissionId, so a stale/disabled QR can't be used to attach a
   * complaint after the fact.
   */
  async submitComplaint(token: string, dto: SubmitComplaintDto): Promise<{ complaintId: string }> {
    const { campaign } = await this._resolveChain(token);
    const complaint: FeedbackComplaint = await this.complaintService.submitPublic(dto, campaign);
    return { complaintId: complaint.id };
  }

  /**
   * Blocks a device once it's submitted `settings.maxSubmissionsPerDevice`
   * times against this campaign within the rolling window -- across every QR
   * code that points at it, not just the one that was scanned this time.
   * Prefers `anonymousId` (a persistent id the frontend stores in
   * localStorage per device -- see app/feedback/f/[token]/page.tsx -- not
   * the ephemeral one this service used to hand out per page load, which
   * reset on every visit and so never actually capped anything). Falls back
   * to `ipHash` only when no anonymousId was sent at all (e.g. localStorage
   * blocked), since IP is a much blunter signal that can under- or
   * over-count on a shared network.
   */
  private async _enforceSubmissionLimit(campaignId: string, anonymousId: string | undefined, ipHash: string | null | undefined, settings: FeedbackSettings): Promise<void> {
    const since = new Date(Date.now() - settings.submissionLimitWindowHours * 60 * 60 * 1000);
    const where = anonymousId
      ? { campaignId, anonymousId, submittedAt: MoreThan(since) }
      : ipHash
        ? { campaignId, ipHash, submittedAt: MoreThan(since) }
        : null;
    if (!where) return; // no identifying signal at all -- nothing to rate-limit against

    const count = await this.submissionRepo.count({ where });
    if (count >= settings.maxSubmissionsPerDevice) {
      throw new BadRequestException(
        `You've reached the maximum number of feedback submissions (${settings.maxSubmissionsPerDevice}) for this survey. Thank you for sharing your experience with us.`,
      );
    }
  }

  /**
   * Resolves a raw answer value into what the patient actually saw/picked,
   * snapshotted at submit time (see FeedbackAnswer.displayValue's doc
   * comment for why). Option-based types store an option's internal
   * `value` (a builder-chosen code, not necessarily readable) -- this
   * looks that up against the live question's options and shows the
   * label(s) instead; everything else is just stringified sensibly.
   */
  private _computeDisplayValue(question: FeedbackQuestion, value: unknown): string {
    if (OPTION_BASED_QUESTION_TYPES.has(question.questionType as FeedbackQuestionType)) {
      const values = Array.isArray(value) ? value : [value];
      const labels = values
        .filter(v => v !== undefined && v !== null && v !== '')
        .map(v => (question.options ?? []).find(o => o.value === String(v))?.label ?? String(v));
      return labels.join(', ');
    }
    if (question.questionType === 'YES_NO') {
      return value === 'YES' ? 'Yes' : value === 'NO' ? 'No' : String(value ?? '');
    }
    if (Array.isArray(value)) return value.map(v => String(v)).join(', ');
    return value === undefined || value === null ? '' : String(value);
  }
}
