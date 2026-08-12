import { Injectable, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvDailyLearningRecord } from './entities/cv-daily-learning-record.entity';

import { CvAttendanceService } from '../attendance/cv-attendance.service';
import { CvDevelopmentService } from '../development/cv-development.service';
import { CvCurriculumService } from '../curriculum/cv-curriculum.service';
import { CvIepService } from '../iep/cv-iep.service';
import { CvAnalyticsService } from '../analytics/cv-analytics.service';

export interface SubmitDlrDto extends Partial<CvDailyLearningRecord> {
  attendanceStatus?: string; // PRESENT, ABSENT, etc.
  behaviours?: Array<{ type: string, category: string, intensity?: string, description?: string, actionTaken?: string }>;
  objectives?: Array<{ objectiveId: string, status: string, notes?: string }>;
  iepGoals?: Array<{ goalId: string, progressNotes: string, statusUpdate?: string }>;
}

@Injectable()
export class CvDailyLearningRecordService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    @InjectRepository(CvDailyLearningRecord)
    private readonly dlrRepo: Repository<CvDailyLearningRecord>,
    
    // Injected services for the cascade
    @Inject(forwardRef(() => CvAttendanceService)) private readonly attendanceService: CvAttendanceService,
    @Inject(forwardRef(() => CvDevelopmentService)) private readonly developmentService: CvDevelopmentService,
    @Inject(forwardRef(() => CvCurriculumService)) private readonly curriculumService: CvCurriculumService,
    @Inject(forwardRef(() => CvIepService)) private readonly iepService: CvIepService,
    @Inject(forwardRef(() => CvAnalyticsService)) private readonly analyticsService: CvAnalyticsService,
  ) {}

  async submitRecord(actorId: string, recordData: SubmitDlrDto) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    let dlr = await this.dlrRepo.findOne({
      where: { 
        studentId: recordData.studentId, 
        date: recordData.date 
      }
    });

    if (dlr) {
      // Update existing
      dlr = this.dlrRepo.merge(dlr, recordData);
    } else {
      // Create new
      dlr = this.dlrRepo.create({
        ...recordData,
        tenantId,
        teacherId: actorId, // original creator
      });
    }

    const saved = await this.dlrRepo.save(dlr);

    // CASCADE: 1. Attendance
    if (recordData.attendanceStatus) {
      await this.attendanceService.markAttendance(
        actorId, 
        [{
          studentId: recordData.studentId,
          date: recordData.date,
          status: recordData.attendanceStatus,
          remarks: 'Logged via DLR',
        }]
      );
    }

    // CASCADE: 2. Behaviours
    if (recordData.behaviours && recordData.behaviours.length > 0) {
      for (const b of recordData.behaviours) {
        await this.developmentService.logBehaviour(actorId, {
          studentId: recordData.studentId,
          date: recordData.date,
          type: b.type,
          category: b.category,
          intensity: b.intensity,
          description: b.description,
          actionTaken: b.actionTaken,
        });
      }
    }

    // CASCADE: 3. Curriculum Objectives
    if (recordData.objectives && recordData.objectives.length > 0) {
      for (const obj of recordData.objectives) {
        await this.curriculumService.updateStudentProgress(
          actorId,
          recordData.studentId!,
          obj.objectiveId,
          obj.status,
          obj.notes
        );
      }
    }

    // CASCADE: 4. IEP Goals
    if (recordData.iepGoals && recordData.iepGoals.length > 0) {
      for (const goal of recordData.iepGoals) {
        await this.iepService.logGoalReview(
          actorId,
          goal.goalId,
          goal.progressNotes,
          goal.statusUpdate
        );
      }
    }

    // CASCADE: 5. AI Timeline Ingestion
    await this.analyticsService.logEventForAI(
      actorId,
      recordData.studentId!,
      'DLR_SUBMITTED',
      {
        attendanceStatus: recordData.attendanceStatus,
        objectivesUpdated: recordData.objectives?.length || 0,
        iepGoalsUpdated: recordData.iepGoals?.length || 0,
        behavioursLogged: recordData.behaviours?.length || 0,
      },
      saved.id,
      'cv_daily_learning_records'
    );

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_DLR_SUBMITTED',
      tenantId,
      userId: actorId,
      entityId: saved.id,
      entityType: 'cv_daily_learning_records',
      metadata: { studentId: saved.studentId, date: saved.date, cascaded: true },
    });

    return saved;
  }

  async getStudentRecords(studentId: string, limit: number = 10) {
    return this.dlrRepo.find({
      where: { studentId },
      order: { date: 'DESC' },
      take: limit,
    });
  }
}
