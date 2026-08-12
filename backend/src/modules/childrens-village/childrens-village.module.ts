import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CvAcademicYear } from './academic-years/entities/cv-academic-year.entity';
import { CvClass } from './classes/entities/cv-class.entity';
import { CvSection } from './sections/entities/cv-section.entity';
import { CvSubject } from './subjects/entities/cv-subject.entity';

import { CvAcademicYearService } from './academic-years/cv-academic-year.service';
import { CvAcademicYearController } from './academic-years/cv-academic-year.controller';

import { CvClassService } from './classes/cv-class.service';
import { CvClassController } from './classes/cv-class.controller';

import { CvSectionService } from './sections/cv-section.service';
import { CvSectionController } from './sections/cv-section.controller';

import { CvSubjectService } from './subjects/cv-subject.service';
import { CvSubjectController } from './subjects/cv-subject.controller';

import { CvTerm } from './academic-years/entities/cv-term.entity';
import { CvStudent } from './students/entities/cv-student.entity';
import { CvGuardian } from './students/entities/cv-guardian.entity';
import { CvStudentGuardianLink } from './students/entities/cv-student-guardian-link.entity';
import { CvStudentDocument } from './students/entities/cv-student-document.entity';
import { CvStudentMedicalProfile } from './students/entities/cv-student-medical-profile.entity';
import { CvStudentAllocation } from './students/entities/cv-student-allocation.entity';
import { CvTimetable } from './timetables/entities/cv-timetable.entity';
import { CvTimetablePeriod } from './timetables/entities/cv-timetable-period.entity';
import { CvTimetablePeriodOverride } from './timetables/entities/cv-timetable-period-override.entity';
import { CvStudentScheduleOverride } from './timetables/entities/cv-student-schedule-override.entity';
// Timetable Management Phase 1 (Foundation) -- see design spec + migration
// 1790300000000-CreateCvTimetableFoundation.ts
import { CvClassSubjectTeacher } from './timetables/entities/cv-class-subject-teacher.entity';
import { CvTeacherProfile } from './timetables/entities/cv-teacher-profile.entity';
import { CvTeacherAvailability } from './timetables/entities/cv-teacher-availability.entity';
import { CvLessonCompletionRecord } from './timetables/entities/cv-lesson-completion-record.entity';
import { CvTimetableApprovalConfig } from './timetables/entities/cv-timetable-approval-config.entity';
// Timetable Management Phase 6 (Workflow Integration) -- see migration
// 1790400000000-CreateCvTimetableWorkflow.ts
import { CvTimetableWorkflowTemplate } from './timetables/entities/cv-timetable-workflow-template.entity';
import { CvTimetableWorkflowInstance } from './timetables/entities/cv-timetable-workflow-instance.entity';
import { CvTimetableWorkflowTask } from './timetables/entities/cv-timetable-workflow-task.entity';
// Timetable Management Phase 7 (Teacher Requests) -- see migration
// 1790500000000-CreateCvTimetableChangeRequests.ts
import { CvTimetableChangeRequest } from './timetables/entities/cv-timetable-change-request.entity';
import { CvStudentAttendance } from './attendance/entities/cv-student-attendance.entity';
import { CvDailyLearningRecord } from './learning-records/entities/cv-daily-learning-record.entity';
import { CvTeacherTask } from './teacher-workspace/entities/cv-teacher-task.entity';
import { CvTeacherDashboardPreference } from './teacher-workspace/entities/cv-teacher-dashboard-preference.entity';

// Phase 5 Curriculum
import { CvCurriculumFramework } from './curriculum/entities/cv-curriculum-framework.entity';
import { CvGrade } from './curriculum/entities/cv-grade.entity';
import { CvCurriculumUnit } from './curriculum/entities/cv-curriculum-unit.entity';
import { CvCurriculumTopic } from './curriculum/entities/cv-curriculum-topic.entity';
import { CvCurriculumObjective } from './curriculum/entities/cv-curriculum-objective.entity';
import { CvStudentCurriculumProgress } from './curriculum/entities/cv-student-curriculum-progress.entity';

// Phase 5 IEP
import { CvIepDomain } from './iep/entities/cv-iep-domain.entity';
import { CvIep } from './iep/entities/cv-iep.entity';
import { CvIepGoal } from './iep/entities/cv-iep-goal.entity';
import { CvIepReview } from './iep/entities/cv-iep-review.entity';

// Phase 5 Development
import { CvBehaviour } from './development/entities/cv-behaviour.entity';
import { CvHomeProgram } from './development/entities/cv-home-program.entity';
import { CvParentDiary } from './development/entities/cv-parent-diary.entity';

// Phase 6 Reporting & Analytics & Notifications
import { CvReport } from './reporting/entities/cv-report.entity';
import { CvReportExport } from './reporting/entities/cv-report-export.entity';
import { CvAnalyticsSnapshot } from './analytics/entities/cv-analytics-snapshot.entity';
import { CvEventTimeline } from './analytics/entities/cv-event-timeline.entity';
import { CvAlert } from './notifications/entities/cv-alert.entity';

// Phase 7 Assessments & Resources & Calendar
import { CvAssessmentTemplate } from './assessments/entities/cv-assessment-template.entity';
import { CvAssessmentDomain } from './assessments/entities/cv-assessment-domain.entity';
import { CvStudentAssessment } from './assessments/entities/cv-student-assessment.entity';
import { CvStudentAssessmentScore } from './assessments/entities/cv-student-assessment-score.entity';
import { CvCalendarEvent } from './academic-years/entities/cv-calendar-event.entity';
import { CvEvent } from './events/entities/cv-event.entity';
import { CvEventParticipant } from './events/entities/cv-event-participant.entity';
import { CvClassroom } from './resources/entities/cv-classroom.entity';
import { CvResource } from './resources/entities/cv-resource.entity';
import { CvResourceBooking } from './resources/entities/cv-resource-booking.entity';
import { CvDocument } from './documents/entities/cv-document.entity';
import { CvDocumentVersion } from './documents/entities/cv-document-version.entity';

// Phase 8 Therapy & EIC Integration
import { CvEicGoalLink } from './eic-integration/entities/cv-eic-goal-link.entity';
import { CvEicReferral } from './eic-integration/entities/cv-eic-referral.entity';
import { CvTherapyCarryover } from './eic-integration/entities/cv-therapy-carryover.entity';
import { CvEicIntegrationAdapter } from './eic-integration/cv-eic-integration.adapter';

import { CVStudentProvider } from './students/interfaces/cv-student.interface';
import { CVStudentProviderManager } from './students/providers/cv-student-manager.provider';
import { OracleHisStudentProvider } from './students/providers/oracle-his-student.provider';
import { InternalStudentProvider } from './students/providers/internal-student.provider';

import { CvAdmissionsService } from './admissions/cv-admissions.service';
import { CvAdmissionsController } from './admissions/cv-admissions.controller';

import { CvSettings } from './settings/entities/cv-settings.entity';
import { CvSettingsService } from './settings/cv-settings.service';
import { CvSettingsController } from './settings/cv-settings.controller';

import { CvStudentSearchService } from './students/services/cv-student-search.service';
import { CvStudentProfileService } from './students/services/cv-student-profile.service';
import { CvStudentsController } from './students/cv-students.controller';
import { CvAnalyticsController } from './analytics/cv-analytics.controller';

import { CvTimetableService } from './timetables/cv-timetable.service';
import { CvTimetableLifecycleService } from './timetables/cv-timetable-lifecycle.service';
import { CvTimetableController } from './timetables/cv-timetable.controller';
import { CvConflictEngineService } from './timetables/cv-conflict-engine.service';
import { CvTeacherProfileController } from './timetables/cv-teacher-profile.controller';
import { CvClassSubjectTeacherController } from './timetables/cv-class-subject-teacher.controller';
import { CvTeacherAvailabilityController } from './timetables/cv-teacher-availability.controller';
import { CvTeacherProfileService } from './timetables/cv-teacher-profile.service';
import { CvClassSubjectTeacherService } from './timetables/cv-class-subject-teacher.service';
import { CvTeacherAvailabilityService } from './timetables/cv-teacher-availability.service';
import { CvLessonCompletionService } from './timetables/cv-lesson-completion.service';
import { CvTimetableApprovalConfigService } from './timetables/cv-timetable-approval-config.service';
import { CvTimetableWorkflowService } from './timetables/cv-timetable-workflow.service';
import { CvTimetableWorkflowController } from './timetables/cv-timetable-workflow.controller';
import { CvTimetableApprovalCompletionListener } from './timetables/cv-timetable-approval-completion.listener';
import { CvTeacherRequestService } from './timetables/cv-teacher-request.service';
import { CvTeacherRequestController } from './timetables/cv-teacher-request.controller';
import { CvAttendanceService } from './attendance/cv-attendance.service';
import { CvDailyLearningRecordService } from './learning-records/cv-daily-learning-record.service';
import { CvTeacherWorkspaceController } from './teacher-workspace/cv-teacher-workspace.controller';

import { CvCurriculumService } from './curriculum/cv-curriculum.service';
import { CvIepService } from './iep/cv-iep.service';
import { CvDevelopmentService } from './development/cv-development.service';

import { CvReportingService } from './reporting/cv-reporting.service';
import { CvExportService } from './reporting/cv-export.service';
import { CvAnalyticsService } from './analytics/cv-analytics.service';
import { CvNotificationService } from './notifications/cv-notification.service';
import { CvAssessmentService } from './assessments/cv-assessment.service';
import { CvCalendarEventService } from './academic-years/cv-calendar-event.service';
import { CvResourceManagementService } from './resources/cv-resource-management.service';
// Timetable Management Phase 8 (Resources) -- see migration
// 1790600000000-ExtendCvClassroomsForTimetabling.ts
import { CvClassroomService } from './resources/cv-classroom.service';
import { CvClassroomController } from './resources/cv-classroom.controller';
import { CvWorkflowEngineService } from './notifications/cv-workflow-engine.service';

import { AuditModule } from '../audit/audit.module';
import { HisConfigModule } from '../his/config/his-config.module';
import { TenantModule } from '../platform/tenant/tenant.module';
import { FeatureFlagsModule } from '../platform/feature-flags/feature-flags.module';
import { LicensingModule } from '../licensing/license.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Cloud Modules Config (Vendor Portal "standalone vs HIS-connected" control,
// see cv-cloud-provider-config.controller.ts's doc comment) -- registered
// the same way AuthModule registers CloudPasswordResetController's guard:
// TypeOrmModule.forFeature([VendorRegistration]) duplicated directly here
// rather than relying on LicensingModule to export the raw repository
// (it doesn't -- only services/guard/provider tokens), avoiding a circular
// module dependency.
import { VendorRegistration } from '../licensing/entities/vendor-registration.entity';
import { CloudLicensingHmacGuard } from '../licensing/guards/cloud-licensing-hmac.guard';
import { CvCloudProviderConfigController } from './cv-cloud-provider-config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CvAcademicYear,
      CvClass,
      CvSection,
      CvSubject,
      CvTerm,
      CvStudent,
      CvGuardian,
      CvStudentGuardianLink,
      CvStudentDocument,
      CvStudentMedicalProfile,
      CvStudentAllocation,
      CvTimetable,
      CvTimetablePeriod,
      CvTimetablePeriodOverride,
      CvStudentScheduleOverride,
      CvClassSubjectTeacher,
      CvTeacherProfile,
      CvTeacherAvailability,
      CvLessonCompletionRecord,
      CvTimetableApprovalConfig,
      CvTimetableWorkflowTemplate,
      CvTimetableWorkflowInstance,
      CvTimetableWorkflowTask,
      CvTimetableChangeRequest,
      CvStudentAttendance,
      CvDailyLearningRecord,
      CvTeacherTask,
      CvTeacherDashboardPreference,
      CvCurriculumFramework,
      CvGrade,
      CvCurriculumUnit,
      CvCurriculumTopic,
      CvCurriculumObjective,
      CvStudentCurriculumProgress,
      CvIepDomain,
      CvIep,
      CvIepGoal,
      CvIepReview,
      CvBehaviour,
      CvHomeProgram,
      CvParentDiary,
      CvReport,
      CvReportExport,
      CvAnalyticsSnapshot,
      CvEventTimeline,
      CvAlert,
      CvAssessmentTemplate,
      CvAssessmentDomain,
      CvStudentAssessment,
      CvStudentAssessmentScore,
      CvCalendarEvent,
      CvEvent,
      CvEventParticipant,
      CvClassroom,
      CvResource,
      CvResourceBooking,
      CvDocument,
      CvDocumentVersion,
      CvEicGoalLink,
      CvEicReferral,
      CvTherapyCarryover,
      CvSettings,
    ]),
    TypeOrmModule.forFeature([VendorRegistration]),
    AuditModule,
    HisConfigModule,
    TenantModule,
    FeatureFlagsModule,
    LicensingModule,
  ],
  controllers: [
    CvAcademicYearController,
    CvClassController,
    CvSectionController,
    CvSubjectController,
    CvAdmissionsController,
    CvStudentsController,
    CvTeacherWorkspaceController,
    CvTimetableController,
    CvTeacherProfileController,
    CvClassSubjectTeacherController,
    CvTeacherAvailabilityController,
    CvTimetableWorkflowController,
    CvTeacherRequestController,
    CvClassroomController,
    CvCloudProviderConfigController,
    CvAnalyticsController,
    CvSettingsController,
  ],
  providers: [
    CloudLicensingHmacGuard,
    CvAcademicYearService,
    CvClassService,
    CvSectionService,
    CvSubjectService,
    CvAdmissionsService,
    CvSettingsService,
    CvStudentSearchService,
    CvStudentProfileService,
    OracleHisStudentProvider,
    InternalStudentProvider,
    CvTimetableService,
    CvTimetableLifecycleService,
    CvConflictEngineService,
    CvTeacherProfileService,
    CvClassSubjectTeacherService,
    CvTeacherAvailabilityService,
    CvLessonCompletionService,
    CvTimetableApprovalConfigService,
    CvTimetableWorkflowService,
    CvTimetableApprovalCompletionListener,
    CvTeacherRequestService,
    CvAttendanceService,
    CvDailyLearningRecordService,
    {
      provide: CVStudentProvider,
      useClass: CVStudentProviderManager,
    },
    CvCurriculumService,
    CvIepService,
    CvDevelopmentService,
    CvExportService,
    CvReportingService,
    CvAnalyticsService,
    CvNotificationService,
    CvAssessmentService,
    CvCalendarEventService,
    CvResourceManagementService,
    CvClassroomService,
    CvWorkflowEngineService,
    CvEicIntegrationAdapter,
    createTenantScopedRepositoryProvider(CvAcademicYear),
    createTenantScopedRepositoryProvider(CvClass),
    createTenantScopedRepositoryProvider(CvSection),
    createTenantScopedRepositoryProvider(CvSubject),
    createTenantScopedRepositoryProvider(CvTerm),
    createTenantScopedRepositoryProvider(CvStudent),
    createTenantScopedRepositoryProvider(CvGuardian),
    createTenantScopedRepositoryProvider(CvStudentGuardianLink),
    createTenantScopedRepositoryProvider(CvStudentDocument),
    createTenantScopedRepositoryProvider(CvStudentMedicalProfile),
    createTenantScopedRepositoryProvider(CvStudentAllocation),
    createTenantScopedRepositoryProvider(CvTimetable),
    createTenantScopedRepositoryProvider(CvTimetablePeriod),
    createTenantScopedRepositoryProvider(CvStudentScheduleOverride),
    createTenantScopedRepositoryProvider(CvClassSubjectTeacher),
    createTenantScopedRepositoryProvider(CvTeacherProfile),
    createTenantScopedRepositoryProvider(CvTeacherAvailability),
    createTenantScopedRepositoryProvider(CvLessonCompletionRecord),
    createTenantScopedRepositoryProvider(CvTimetableApprovalConfig),
    createTenantScopedRepositoryProvider(CvTimetableWorkflowTemplate),
    createTenantScopedRepositoryProvider(CvTimetableWorkflowInstance),
    createTenantScopedRepositoryProvider(CvTimetableWorkflowTask),
    createTenantScopedRepositoryProvider(CvTimetableChangeRequest),
    createTenantScopedRepositoryProvider(CvStudentAttendance),
    createTenantScopedRepositoryProvider(CvDailyLearningRecord),
    createTenantScopedRepositoryProvider(CvTeacherTask),
    createTenantScopedRepositoryProvider(CvTeacherDashboardPreference),
    createTenantScopedRepositoryProvider(CvCurriculumFramework),
    createTenantScopedRepositoryProvider(CvGrade),
    createTenantScopedRepositoryProvider(CvCurriculumUnit),
    createTenantScopedRepositoryProvider(CvCurriculumTopic),
    createTenantScopedRepositoryProvider(CvCurriculumObjective),
    createTenantScopedRepositoryProvider(CvStudentCurriculumProgress),
    createTenantScopedRepositoryProvider(CvIepDomain),
    createTenantScopedRepositoryProvider(CvIep),
    createTenantScopedRepositoryProvider(CvIepGoal),
    createTenantScopedRepositoryProvider(CvIepReview),
    createTenantScopedRepositoryProvider(CvBehaviour),
    createTenantScopedRepositoryProvider(CvHomeProgram),
    createTenantScopedRepositoryProvider(CvParentDiary),
    createTenantScopedRepositoryProvider(CvReport),
    createTenantScopedRepositoryProvider(CvReportExport),
    createTenantScopedRepositoryProvider(CvAnalyticsSnapshot),
    createTenantScopedRepositoryProvider(CvEventTimeline),
    createTenantScopedRepositoryProvider(CvAlert),
    createTenantScopedRepositoryProvider(CvAssessmentTemplate),
    createTenantScopedRepositoryProvider(CvAssessmentDomain),
    createTenantScopedRepositoryProvider(CvStudentAssessment),
    createTenantScopedRepositoryProvider(CvStudentAssessmentScore),
    createTenantScopedRepositoryProvider(CvCalendarEvent),
    createTenantScopedRepositoryProvider(CvEvent),
    createTenantScopedRepositoryProvider(CvEventParticipant),
    createTenantScopedRepositoryProvider(CvClassroom),
    createTenantScopedRepositoryProvider(CvResource),
    createTenantScopedRepositoryProvider(CvResourceBooking),
    createTenantScopedRepositoryProvider(CvDocument),
    createTenantScopedRepositoryProvider(CvDocumentVersion),
    createTenantScopedRepositoryProvider(CvEicGoalLink),
    createTenantScopedRepositoryProvider(CvEicReferral),
    createTenantScopedRepositoryProvider(CvTherapyCarryover),
  ],
  exports: [
    CvAcademicYearService,
    CvClassService,
    CvSectionService,
    CvSubjectService,
    CvAdmissionsService,
    CvSettingsService,
    CvStudentSearchService,
    CvStudentProfileService,
    CVStudentProvider,
    CvTimetableService,
    CvTimetableLifecycleService,
    CvConflictEngineService,
    CvTeacherProfileService,
    CvClassSubjectTeacherService,
    CvTeacherAvailabilityService,
    CvLessonCompletionService,
    CvTimetableApprovalConfigService,
    CvTimetableWorkflowService,
    CvTeacherRequestService,
    CvAttendanceService,
    CvDailyLearningRecordService,
    CvCurriculumService,
    CvIepService,
    CvDevelopmentService,
    CvExportService,
    CvReportingService,
    CvAnalyticsService,
    CvNotificationService,
    CvAssessmentService,
    CvCalendarEventService,
    CvResourceManagementService,
    CvClassroomService,
    CvWorkflowEngineService,
    CvEicIntegrationAdapter,
  ],
})
export class ChildrensVillageModule {}
