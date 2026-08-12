import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Platform / Shared modules
import { PlatformModule } from '../platform/platform.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { LicensingModule } from '../licensing/license.module';

// Tenant Scoping
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Entities
import { IncidentCategory } from './entities/incident-category.entity';
import { IncidentType } from './entities/incident-type.entity';
import { IncidentSeverityLevel } from './entities/incident-severity-level.entity';
import { IncidentPriorityLevel } from './entities/incident-priority-level.entity';
import { IncidentRiskMatrixConfig } from './entities/incident-risk-matrix-config.entity';
import { Incident } from './entities/incident.entity';
import { IncidentTimelineEvent } from './entities/incident-timeline-event.entity';
import { IncidentAttachment } from './entities/incident-attachment.entity';
import { IncidentTriage } from './entities/incident-triage.entity';
import { IncidentInvestigation } from './entities/incident-investigation.entity';
import { IncidentInvestigationStatement } from './entities/incident-investigation-statement.entity';
import { IncidentRca } from './entities/incident-rca.entity';
import { IncidentRcaFiveWhy } from './entities/incident-rca-five-why.entity';
import { IncidentRcaFishboneNode } from './entities/incident-rca-fishbone-node.entity';
import { IncidentCapa } from './entities/incident-capa.entity';
import { IncidentCapaEvidence } from './entities/incident-capa-evidence.entity';
import { IncidentVerification } from './entities/incident-verification.entity';
import { IncidentClosure } from './entities/incident-closure.entity';
import { IncidentNotificationRule } from './entities/incident-notification-rule.entity';
import { IncidentNotificationRole } from './entities/incident-notification-role.entity';
import { IncidentComment } from './entities/incident-comment.entity';
import { ANTI_VIRUS_PROVIDER, NoOpAntiVirusProvider } from './attachments/anti-virus.provider';

// Services
import { IncidentNumberService } from './incidents/incident-number.service';
import { IncidentWorkflowService } from './incidents/incident-workflow.service';
import { IncidentSlaService } from './incidents/incident-sla.service';
import { IncidentTimelineService } from './timeline/incident-timeline.service';
import { IncidentCommentService } from './timeline/incident-comment.service';
import { IncidentNotificationRuleService } from './notifications/incident-notification-rule.service';
import { IncidentEmployeeService } from './incidents/incident-employee.service';
import { IncidentSettingsService } from './settings/incident-settings.service';
import { IncidentService } from './incidents/incident.service';
import { IncidentTriageService } from './triage/incident-triage.service';
import { IncidentInvestigationService } from './investigation/incident-investigation.service';
import { IncidentRcaService } from './rca/incident-rca.service';
import { IncidentCapaService } from './capa/incident-capa.service';
import { IncidentVerificationService } from './verification/incident-verification.service';
import { IncidentClosureService } from './closure/incident-closure.service';
import { IncidentAttachmentService } from './attachments/incident-attachment.service';
import { IncidentDashboardService } from './dashboard/incident-dashboard.service';
import { IncidentAnalyticsService } from './analytics/incident-analytics.service';
import { IncidentAiService } from './ai/incident-ai.service';

// Controllers
import { IncidentController } from './incidents/incident.controller';
import { IncidentHisController } from './incidents/incident-his.controller';
import { IncidentTriageController } from './triage/incident-triage.controller';
import { IncidentInvestigationController } from './investigation/incident-investigation.controller';
import { IncidentRcaController } from './rca/incident-rca.controller';
import { IncidentCapaController } from './capa/incident-capa.controller';
import { IncidentVerificationController } from './verification/incident-verification.controller';
import { IncidentClosureController } from './closure/incident-closure.controller';
import { IncidentTimelineController } from './timeline/incident-timeline.controller';
import { IncidentCommentController } from './timeline/incident-comment.controller';
import { IncidentSettingsController } from './settings/incident-settings.controller';
import { IncidentAttachmentController } from './attachments/incident-attachment.controller';
import { IncidentDashboardController } from './dashboard/incident-dashboard.controller';
import { IncidentAnalyticsController } from './analytics/incident-analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncidentCategory,
      IncidentType,
      IncidentSeverityLevel,
      IncidentPriorityLevel,
      IncidentRiskMatrixConfig,
      Incident,
      IncidentTimelineEvent,
      IncidentAttachment,
      IncidentTriage,
      IncidentInvestigation,
      IncidentInvestigationStatement,
      IncidentRca,
      IncidentRcaFiveWhy,
      IncidentRcaFishboneNode,
      IncidentCapa,
      IncidentCapaEvidence,
      IncidentVerification,
      IncidentClosure,
      IncidentNotificationRule,
      IncidentNotificationRole,
      IncidentComment,
    ]),
    PlatformModule,
    AuditModule,
    SettingsModule,
    UsersModule,
    LicensingModule,
  ],
  controllers: [
    IncidentController,
    IncidentHisController,
    IncidentTriageController,
    IncidentInvestigationController,
    IncidentRcaController,
    IncidentCapaController,
    IncidentVerificationController,
    IncidentClosureController,
    IncidentTimelineController,
    IncidentCommentController,
    IncidentSettingsController,
    IncidentAttachmentController,
    IncidentDashboardController,
    IncidentAnalyticsController,
  ],
  providers: [
    // Scoped Repositories
    createTenantScopedRepositoryProvider(Incident, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(IncidentComment, { mode: 'enforced' }),

    // Extension points
    { provide: ANTI_VIRUS_PROVIDER, useClass: NoOpAntiVirusProvider },

    // Services
    IncidentNumberService,
    IncidentWorkflowService,
    IncidentSlaService,
    IncidentTimelineService,
    IncidentCommentService,
    IncidentNotificationRuleService,
    IncidentEmployeeService,
    IncidentSettingsService,
    IncidentService,
    IncidentTriageService,
    IncidentInvestigationService,
    IncidentRcaService,
    IncidentCapaService,
    IncidentVerificationService,
    IncidentClosureService,
    IncidentAttachmentService,
    IncidentDashboardService,
    IncidentAnalyticsService,
    IncidentAiService,
  ],
  exports: [
    IncidentService,
  ],
})
export class IncidentModule {}
