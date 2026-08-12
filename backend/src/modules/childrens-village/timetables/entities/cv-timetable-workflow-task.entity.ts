import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvTimetableWorkflowInstance } from './cv-timetable-workflow-instance.entity';

export type CvWorkflowTaskStatus = 'pending' | 'completed' | 'cancelled';
export type CvWorkflowApproverType = 'SPECIFIC_USER' | 'CLASS_TEACHER_OF_RECORD' | 'ADMIN';

/**
 * Phase 6 -- one approval step's task, mirroring document-platform's
 * `WorkflowTaskEntity` shape (status/assignee/SLA/escalation) but
 * tenant-scoped, per the migration's header note.
 *
 * `assignedUserId` is null for `approverType: 'ADMIN'` -- that step is
 * resolved by permission (`CV:TIMETABLE:APPROVE` + an admin role) at
 * completion time, not by a stored identity, since there is no fixed
 * "the Administrator" user.
 */
@Entity('cv_timetable_workflow_tasks')
@Index('IDX_CV_TT_WF_TASKS_INSTANCE', ['instanceId'])
@Index('IDX_CV_TT_WF_TASKS_ASSIGNEE', ['assignedUserId', 'status'])
export class CvTimetableWorkflowTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @Column({ name: 'workflow_state', type: 'varchar', length: 100 })
  workflowState: string;

  @Column({ name: 'approver_type', type: 'varchar', length: 30 })
  approverType: CvWorkflowApproverType;

  @Column({ name: 'approver_value', type: 'varchar', length: 255, nullable: true })
  approverValue: string | null;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: CvWorkflowTaskStatus;

  @Column({ name: 'outcome', type: 'varchar', length: 20, nullable: true })
  outcome: 'APPROVED' | 'REJECTED' | null;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'sla_minutes', type: 'int', nullable: true })
  slaMinutes: number | null;

  @Column({ name: 'escalation_level', type: 'int', default: 0 })
  escalationLevel: number;

  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
  completedByUserId: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvTimetableWorkflowInstance)
  @JoinColumn({ name: 'instance_id' })
  instance: CvTimetableWorkflowInstance;
}
