import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { EicPatient }                           from './entities/eic-patient.entity';
import { EicDevelopmentalHistory }              from './entities/eic-developmental-history.entity';
import { EicTherapyEnrollment }                 from './entities/eic-therapy-enrollment.entity';
import { EicTherapyTeamMember }                 from './entities/eic-therapy-team-member.entity';
import { EicAssessment }                        from './entities/eic-assessment.entity';
import { EicGoal }                              from './entities/eic-goal.entity';
import { EicTherapySession }                    from './entities/eic-therapy-session.entity';
import { EicSessionEntry }                      from './entities/eic-session-entry.entity';
import { EicProgressReport }                    from './entities/eic-progress-report.entity';
import { EicDisciplineProgressSection }         from './entities/eic-discipline-progress-section.entity';
import { EicDischargeSummary }                  from './entities/eic-discharge-summary.entity';
import { EicDischargeSection }                  from './entities/eic-discharge-section.entity';
import { EicPreschoolEnrollment }               from './entities/eic-preschool-enrollment.entity';
import { EicPreschoolAssessment }               from './entities/eic-preschool-assessment.entity';
import { EicPreschoolDailyReport }              from './entities/eic-preschool-daily-report.entity';
import { EicEnrollmentDisciplineAssignment }    from './entities/eic-enrollment-discipline-assignment.entity';

// Services
import { EicPatientService }                    from './patient/eic-patient.service';
import { EicEnrollmentService }                 from './enrollment/eic-enrollment.service';
import { EicAssessmentService }                 from './assessment/eic-assessment.service';
import { EicGoalService }                       from './goal/eic-goal.service';
import { EicSessionService }                    from './session/eic-session.service';
import { EicProgressReportService }             from './progress-report/eic-progress-report.service';
import { EicDischargeService }                  from './discharge/eic-discharge.service';
import { EicPreschoolService }                  from './preschool/eic-preschool.service';
import { EicDisciplineAssignmentService }       from './discipline-assignment/eic-discipline-assignment.service';

// Controllers
import { EicPatientController }                 from './patient/eic-patient.controller';
import { EicEnrollmentController }              from './enrollment/eic-enrollment.controller';
import { EicAssessmentController }              from './assessment/eic-assessment.controller';
import { EicGoalController }                    from './goal/eic-goal.controller';
import { EicSessionController }                 from './session/eic-session.controller';
import { EicProgressReportController }          from './progress-report/eic-progress-report.controller';
import { EicDischargeController }               from './discharge/eic-discharge.controller';
import { EicPreschoolController }               from './preschool/eic-preschool.controller';
import { EicDisciplineAssignmentController }    from './discipline-assignment/eic-discipline-assignment.controller';

// Workflow
import { EicProgressReportPolicy }              from './progress-report/eic-progress-report.policy';

// Platform modules
import { AuditModule }                          from '../audit/audit.module';
import { LicensingModule }                      from '../licensing/license.module';
import { HisModule }                            from '../his/his.module';
import { RedisProvider }                        from '../../common/redis/redis.provider';
import { User }                                 from '../users/entities/user.entity';

// Stage B (Checkpoint B3.5) — tenant scoping infrastructure
import { TenantModule }                         from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EicPatient,
      EicDevelopmentalHistory,
      EicTherapyEnrollment,
      EicTherapyTeamMember,
      EicAssessment,
      EicGoal,
      EicTherapySession,
      EicSessionEntry,
      EicProgressReport,
      EicDisciplineProgressSection,
      EicDischargeSummary,
      EicDischargeSection,
      EicPreschoolEnrollment,
      EicPreschoolAssessment,
      EicPreschoolDailyReport,
      EicEnrollmentDisciplineAssignment,
      User,   // needed by EicProgressReportService to resolve submitter names
    ]),
    AuditModule,
    LicensingModule,
    HisModule,
    TenantModule,
  ],
  controllers: [
    EicPatientController,
    EicEnrollmentController,
    EicAssessmentController,
    EicGoalController,
    EicSessionController,
    EicProgressReportController,
    EicDischargeController,
    EicPreschoolController,
    EicDisciplineAssignmentController,
  ],
  providers: [
    RedisProvider,
    EicPatientService,
    EicEnrollmentService,
    EicAssessmentService,
    EicGoalService,
    EicSessionService,
    EicProgressReportService,
    EicDischargeService,
    EicPreschoolService,
    EicDisciplineAssignmentService,
    EicProgressReportPolicy,

    // Stage B (Checkpoint B3.5) — scoped repositories for the 29 eligible read
    // methods identified in the pre-flight. Alongside (not replacing) the raw
    // TypeOrmModule.forFeature repositories above. Only entities actually
    // queried by an eligible read method get a provider —
    // EicSessionEntry/EicDischargeSection/EicDisciplineProgressSection are
    // loaded exclusively via `relations: [...]` on their parent's scoped
    // query, not as standalone repository reads, so they don't need one.
    //
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the same
    // consolidated audit/fix pass that flipped Users after live testing
    // found a confirmed cross-tenant leak there. EIC carries the most
    // sensitive data of any dry-run module (patient clinical/therapy
    // records) so it was fixed first among the remaining six. See
    // `HYBRID_ARCHITECTURE_LOG.md` and `PHASE_10_DEFERRED_BACKLOG.md`.
    createTenantScopedRepositoryProvider(EicPatient, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicDevelopmentalHistory, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicTherapyEnrollment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicTherapyTeamMember, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicAssessment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicGoal, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicTherapySession, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicDischargeSummary, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicPreschoolEnrollment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicPreschoolAssessment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicPreschoolDailyReport, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicEnrollmentDisciplineAssignment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(EicProgressReport, { mode: 'enforced' }),
  ],
  exports: [
    EicPatientService,
    EicEnrollmentService,
    EicAssessmentService,
    EicGoalService,
    EicSessionService,
    EicProgressReportService,
    EicDischargeService,
    EicPreschoolService,
    EicDisciplineAssignmentService,
  ],
})
export class EicModule {}
