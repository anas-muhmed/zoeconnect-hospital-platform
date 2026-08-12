import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvTimetableWorkflowTemplate } from './cv-timetable-workflow-template.entity';

export type CvWorkflowInstanceStatus = 'active' | 'completed' | 'cancelled';
export type CvWorkflowOutcome = 'APPROVED' | 'REJECTED';

/**
 * Phase 6 -- one approval run against one "source" (a timetable version
 * being published, or later a change request). `sourceType`/`sourceId`
 * are a loose polymorphic pointer (no FK -- the source can be
 * `cv_timetables` today, `cv_timetable_change_requests` from Phase 7
 * later), matching how `CvTimetableChangeRequest.approvalInstanceId` was
 * always intended to reference "some approval instance" per the original
 * design spec, just now pointing here instead of the document-platform
 * table that spec assumed.
 */
@Entity('cv_timetable_workflow_instances')
@Index('IDX_CV_TT_WF_INSTANCES_SOURCE', ['sourceType', 'sourceId'])
@Index('IDX_CV_TT_WF_INSTANCES_TENANT_STATUS', ['tenantId', 'status'])
export class CvTimetableWorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'workflow_template_id', type: 'uuid' })
  workflowTemplateId: string;

  @Column({ name: 'source_type', type: 'varchar', length: 30 })
  sourceType: string; // e.g. 'TIMETABLE_PUBLISH', 'CHANGE_REQUEST'

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  // Resolved once at instance creation and reused for every
  // CLASS_TEACHER_OF_RECORD step, so a class-teacher change mid-approval
  // doesn't retroactively alter who approved earlier steps.
  classId: string | null;

  @Column({ name: 'current_state', type: 'varchar', length: 100 })
  currentState: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status: CvWorkflowInstanceStatus;

  @Column({ name: 'outcome', type: 'varchar', length: 20, nullable: true })
  outcome: CvWorkflowOutcome | null;

  @Column({ name: 'initiated_by', type: 'uuid' })
  initiatedBy: string;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvTimetableWorkflowTemplate)
  @JoinColumn({ name: 'workflow_template_id' })
  template: CvTimetableWorkflowTemplate;
}
