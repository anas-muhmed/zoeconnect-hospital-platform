import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { FeedbackForm } from './entities/feedback-form.entity';
import { FeedbackSection } from './entities/feedback-section.entity';
import { FeedbackQuestion } from './entities/feedback-question.entity';
import { FeedbackQuestionOption } from './entities/feedback-question-option.entity';
import { FeedbackQuestionCondition } from './entities/feedback-question-condition.entity';
import { FeedbackAuditLog } from './entities/feedback-audit-log.entity';
import { FeedbackCampaign } from './entities/feedback-campaign.entity';
import { FeedbackQrCode } from './entities/feedback-qr-code.entity';
import { FeedbackSubmission } from './entities/feedback-submission.entity';
import { FeedbackAnswer } from './entities/feedback-answer.entity';
import { FeedbackComplaint } from './entities/feedback-complaint.entity';
import { FeedbackLanguage } from './entities/feedback-language.entity';
import { FeedbackTranslation } from './entities/feedback-translation.entity';
import { FeedbackNotification } from './entities/feedback-notification.entity';
import { FeedbackSettings } from './entities/feedback-settings.entity';

// Audit
import { FeedbackAuditService } from './audit/feedback-audit.service';
import { FeedbackAuditController } from './audit/feedback-audit.controller';

// Forms
import { FeedbackFormService } from './forms/feedback-form.service';
import { FeedbackFormController } from './forms/feedback-form.controller';

// Form builder (sections/questions/options/conditions)
import { FeedbackQuestionService } from './questions/feedback-question.service';
import { FeedbackQuestionController } from './questions/feedback-question.controller';

// Phase 2: Campaigns, QR codes, public portal, submissions
import { FeedbackCampaignService } from './campaigns/feedback-campaign.service';
import { FeedbackCampaignController } from './campaigns/feedback-campaign.controller';
import { FeedbackQrService } from './qr/feedback-qr.service';
import { FeedbackQrController } from './qr/feedback-qr.controller';
import { FeedbackPublicService } from './public/feedback-public.service';
import { FeedbackPublicController } from './public/feedback-public.controller';
import { FeedbackResponseService } from './responses/feedback-response.service';
import { FeedbackResponseController } from './responses/feedback-response.controller';

// Complaint diversion & management
import { FeedbackComplaintService } from './complaints/feedback-complaint.service';
import { FeedbackComplaintController } from './complaints/feedback-complaint.controller';

// Analytics dashboard
import { FeedbackAnalyticsService } from './analytics/feedback-analytics.service';
import { FeedbackAnalyticsController } from './analytics/feedback-analytics.controller';

// Reports (CSV export)
import { FeedbackReportService } from './reports/feedback-report.service';
import { FeedbackReportController } from './reports/feedback-report.controller';

// Multi-language
import { FeedbackLanguageService } from './languages/feedback-language.service';
import { FeedbackLanguageController } from './languages/feedback-language.controller';
import { FeedbackTranslationService } from './translations/feedback-translation.service';
import { FeedbackTranslationController } from './translations/feedback-translation.controller';

// Notification engine (in-app staff feed + optional patient WhatsApp on resolution)
import { FeedbackNotificationService } from './notifications/feedback-notification.service';
import { FeedbackNotificationController } from './notifications/feedback-notification.controller';
import { NotificationModule } from '../notifications/notification.module';

// Settings (v1.0 capstone)
import { FeedbackSettingsService } from './settings/feedback-settings.service';
import { FeedbackSettingsController } from './settings/feedback-settings.controller';

// Stage B (Checkpoint B3.7) — tenant scoping infrastructure
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Phase 2 (Hybrid Architecture) — object storage abstraction seam
import { StorageModule } from '../platform/services/object-repository/object-repository.module';

/**
 * FeedbackModule --- Patient Feedback & Experience Management.
 *
 * Phase 1 (Foundation: Form Builder): dynamic form/section/question/
 * option/condition CRUD, publish/unpublish/archive/clone, and its own
 * audit log.
 *
 * Phase 2 (QR Codes + Campaigns + Public Portal + Submission Engine):
 * campaigns bind a form to a named purpose (spec §14), QR codes point at a
 * campaign via a random token (never an internal id), and the fully public
 * FeedbackPublicController resolves that token and accepts submissions with
 * no authentication -- mirroring the CMS player controller's no-guards
 * pattern. FeedbackResponseController gives admins minimal read access to
 * verify the end-to-end flow.
 *
 * Deliberately independent of HIS/patient-lookup throughout -- no entity
 * here references a patient record, only an optional branch_id and (for
 * submissions) a random per-device anonymous_id used solely for duplicate-
 * submission checks.
 *
 * Google Review flow (post-submission "smart redirect" for high ratings)
 * and Complaint Diversion & Management (opt-in "tell us more" for low
 * ratings) are the two branches of `FeedbackPublicService.submit()`'s
 * post-submission response -- see `_buildPostSubmitResponse`. A complaint
 * only ever exists because a patient chose to submit one from that screen;
 * there's no admin-authored complaint entry point.
 *
 * Analytics dashboard: FeedbackAnalyticsService/Controller expose a single
 * read-only aggregate endpoint (`GET /feedback/analytics/dashboard`) over
 * the existing submissions/complaints/campaigns tables -- no new schema.
 *
 * Reports: FeedbackReportService/Controller expose CSV exports (raw rows,
 * not aggregates) over the same data -- submissions summary, complaints,
 * and one-row-per-answer -- under `/feedback/reports/export/*`.
 *
 * Multi-language: FeedbackLanguage is a global pool of languages an admin
 * can translate forms into; FeedbackTranslation is a generic (entity,
 * field, language) -> text table overlaid onto a form's tree at read time
 * (see FeedbackTranslationService.applyTranslations), used by both the
 * builder's translation editor and the public portal's `?lang=` param.
 *
 * Notification engine: FeedbackNotification is a self-contained in-app
 * "something needs attention" feed for staff (currently just "a new
 * complaint arrived") -- there's no platform-wide in-app notification
 * concept to hook into. Separately, FeedbackComplaintService.update()
 * best-effort sends a real WhatsApp message to the patient when their
 * complaint is resolved, reusing the platform NotificationModule (the only
 * channel actually wired to a live provider), gated behind an env-
 * configured, pre-approved template name so it's a safe no-op rather than
 * a silent failure when unconfigured.
 *
 * Settings (v1.0 capstone): FeedbackSettings is a singleton-row,
 * branch-override-ready configuration table read through a cached
 * `FeedbackSettingsService` (5-minute in-memory TTL, invalidated on write --
 * see its doc comment for why this is the one settings service in ZoeConnect that
 * actually caches). Every previously-hardcoded constant across the phases
 * above (submission spam limits, Google Review default copy/threshold,
 * splash duration bounds, complaint categories, the WhatsApp resolution
 * template) now reads from here. This phase completes Feedback v1.0.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedbackForm, FeedbackSection, FeedbackQuestion,
      FeedbackQuestionOption, FeedbackQuestionCondition, FeedbackAuditLog,
      FeedbackCampaign, FeedbackQrCode, FeedbackSubmission, FeedbackAnswer,
      FeedbackComplaint, FeedbackLanguage, FeedbackTranslation, FeedbackNotification,
      FeedbackSettings,
    ]),
    NotificationModule,
    TenantModule,
    StorageModule,
  ],
  controllers: [
    FeedbackAuditController,
    FeedbackFormController,
    FeedbackQuestionController,
    FeedbackCampaignController,
    FeedbackQrController,
    FeedbackPublicController,
    FeedbackResponseController,
    FeedbackComplaintController,
    FeedbackAnalyticsController,
    FeedbackReportController,
    FeedbackLanguageController,
    FeedbackTranslationController,
    FeedbackNotificationController,
    FeedbackSettingsController,
  ],
  providers: [
    FeedbackAuditService,
    FeedbackFormService,
    FeedbackQuestionService,
    FeedbackCampaignService,
    FeedbackQrService,
    FeedbackComplaintService,
    FeedbackPublicService,
    FeedbackResponseService,
    FeedbackAnalyticsService,
    FeedbackReportService,
    FeedbackLanguageService,
    FeedbackTranslationService,
    FeedbackNotificationService,
    FeedbackSettingsService,

    // Stage B (Checkpoint B3.7) — scoped repositories for the 23 session-resolved
    // eligible read methods identified in the pre-flight. Alongside (not
    // replacing) the raw TypeOrmModule.forFeature repositories above.
    // FeedbackSettings and FeedbackLanguage get no provider — the former
    // is reachable from the chain-resolved public portal (and further
    // write-adjacent session-resolved callers) so it stays fully raw per the
    // pre-flight; the latter is permanently Shared-global, never tenant-scoped.
    //
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
    // audit/fix pass triggered by the confirmed Users cross-tenant leak — see
    // HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
    createTenantScopedRepositoryProvider(FeedbackForm, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackSection, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackQuestion, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackAuditLog, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackCampaign, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackQrCode, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackComplaint, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackSubmission, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackAnswer, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackNotification, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(FeedbackTranslation, { mode: 'enforced' }),
  ],
  exports: [
    FeedbackAuditService,
    FeedbackFormService,
    FeedbackQuestionService,
    FeedbackCampaignService,
    FeedbackQrService,
    FeedbackSettingsService,
  ],
})
export class FeedbackModule {}
