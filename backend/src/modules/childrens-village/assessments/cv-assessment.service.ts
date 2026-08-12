import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvStudentAssessment } from './entities/cv-student-assessment.entity';
import { CvStudentAssessmentScore } from './entities/cv-student-assessment-score.entity';
import { CvAssessmentTemplate } from './entities/cv-assessment-template.entity';
import { CvAnalyticsService } from '../analytics/cv-analytics.service';
import { CvIepService } from '../iep/cv-iep.service';

@Injectable()
export class CvAssessmentService {
  constructor(
    private readonly tenantContext: TenantContextStorage,

    @InjectRepository(CvStudentAssessment) private readonly assessmentWriteRepo: Repository<CvStudentAssessment>,
    @InjectRepository(CvStudentAssessmentScore) private readonly scoreWriteRepo: Repository<CvStudentAssessmentScore>,

    @Inject(getTenantScopedRepositoryToken(CvStudentAssessment)) private readonly assessmentReadRepo: TenantScopedRepository<CvStudentAssessment>,
    @Inject(getTenantScopedRepositoryToken(CvAssessmentTemplate)) private readonly templateReadRepo: TenantScopedRepository<CvAssessmentTemplate>,

    @Inject(forwardRef(() => CvAnalyticsService)) private readonly analyticsService: CvAnalyticsService,
    @Inject(forwardRef(() => CvIepService)) private readonly iepService: CvIepService,
  ) {}

  async createAssessment(studentId: string, templateId: string, assessorId: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    // Find previous assessment to increment version
    const previous = await this.assessmentReadRepo.findOne({
      where: { studentId, templateId },
      order: { version: 'DESC' }
    });

    const newVersion = previous ? previous.version + 1 : 1;

    const assessment = this.assessmentWriteRepo.create({
      tenantId,
      studentId,
      templateId,
      assessorId,
      dateConducted: new Date(),
      status: 'DRAFT',
      version: newVersion
    });

    return this.assessmentWriteRepo.save(assessment);
  }

  async completeAssessment(assessmentId: string, overallScore: number, clinicalNotes: string) {
    const assessment = await this.assessmentReadRepo.findOne({ where: { id: assessmentId }, relations: ['template'] });
    if (!assessment) throw new Error('Assessment not found');
    if (assessment.status === 'COMPLETED') throw new Error('Assessment already completed and is immutable');

    assessment.status = 'COMPLETED';
    assessment.overallScore = overallScore;
    assessment.clinicalNotes = clinicalNotes;

    const saved = await this.assessmentWriteRepo.save(assessment);

    // CASCADE: Analytics and AI Timeline
    await this.analyticsService.logEventForAI(
      assessment.assessorId,
      assessment.studentId,
      'ASSESSMENT_COMPLETED',
      { templateType: assessment.template?.type, overallScore, version: assessment.version },
      saved.id,
      'cv_student_assessments'
    );

    return saved;
  }
}
