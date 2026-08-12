import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvTimetablePeriod } from './cv-timetable-period.entity';
import { CvTimetableWorkflowInstance } from './cv-timetable-workflow-instance.entity';

export type CvChangeRequestType = 'EXCHANGE' | 'SWAP' | 'SUBSTITUTE';

export type CvChangeRequestStatus =
  | 'PENDING_COUNTERPARTY'
  | 'DECLINED'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'APPROVED'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'ROLLED_BACK'
  | 'EXPIRED';

/**
 * Timetable Management Phase 7 -- unifies Period Exchange (one-off,
 * single-period, single teacher-for-teacher), Mutual Swap (bidirectional,
 * two periods), and Substitute Assignment (temporary coverage, no
 * counterparty step) under one auditable table, per design spec Section
 * 2.3-2.5 / 3 / 5.3. See the Phase 7 migration's header comment for why
 * PERMANENT_CHANGE is not a `requestType` here (it reuses Phase 2's
 * existing version-lifecycle flow instead) and why `approvalInstanceId`
 * points at Phase 6's own `cv_timetable_workflow_instances` rather than
 * document-platform's tables.
 *
 * `counterpartyPeriodId` is set only for SWAP (the counterparty's own
 * period being exchanged back). `substituteTeacherId` is set only for
 * SUBSTITUTE (no counterparty acceptance step -- status starts at
 * `PENDING_APPROVAL` directly, per Section 5.3's "skipped for substitute
 * assignment which has no counterparty to accept").
 */
@Entity('cv_timetable_change_requests')
@Index('IDX_CV_TT_CHANGE_REQ_TENANT_STATUS', ['tenantId', 'status'])
@Index('IDX_CV_TT_CHANGE_REQ_INITIATOR', ['initiatingTeacherId'])
@Index('IDX_CV_TT_CHANGE_REQ_COUNTERPARTY', ['counterpartyTeacherId'])
@Index('IDX_CV_TT_CHANGE_REQ_ORIGINAL_PERIOD', ['originalPeriodId'])
export class CvTimetableChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'request_type', type: 'varchar', length: 20 })
  requestType: CvChangeRequestType;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'PENDING_COUNTERPARTY' })
  status: CvChangeRequestStatus;

  /** Resolved once at creation from the original period's timetable -- used for approval-config/classTeacher resolution, same pattern as `CvTimetableWorkflowInstance.classId`. */
  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ name: 'initiating_teacher_id', type: 'uuid' })
  initiatingTeacherId: string;

  @Column({ name: 'counterparty_teacher_id', type: 'uuid', nullable: true })
  counterpartyTeacherId: string | null;

  @Column({ name: 'original_period_id', type: 'uuid' })
  originalPeriodId: string;

  @Column({ name: 'counterparty_period_id', type: 'uuid', nullable: true })
  counterpartyPeriodId: string | null;

  @Column({ name: 'substitute_teacher_id', type: 'uuid', nullable: true })
  substituteTeacherId: string | null;

  @Column({ name: 'affected_date_start', type: 'date' })
  affectedDateStart: string;

  @Column({ name: 'affected_date_end', type: 'date', nullable: true })
  affectedDateEnd: string | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'approval_instance_id', type: 'uuid', nullable: true })
  approvalInstanceId: string | null;

  @Column({ name: 'resulting_override_ids', type: 'uuid', array: true, nullable: true })
  resultingOverrideIds: string[] | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ name: 'block_reason', type: 'text', nullable: true })
  blockReason: string | null;

  @Column({ name: 'rolled_back_at', type: 'timestamp', nullable: true })
  rolledBackAt: Date | null;

  @Column({ name: 'rolled_back_by', type: 'uuid', nullable: true })
  rolledBackBy: string | null;

  @Column({ name: 'rollback_reason', type: 'text', nullable: true })
  rollbackReason: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvTimetablePeriod)
  @JoinColumn({ name: 'original_period_id' })
  originalPeriod: CvTimetablePeriod;

  @ManyToOne(() => CvTimetablePeriod, { nullable: true })
  @JoinColumn({ name: 'counterparty_period_id' })
  counterpartyPeriod: CvTimetablePeriod | null;

  @ManyToOne(() => CvTimetableWorkflowInstance, { nullable: true })
  @JoinColumn({ name: 'approval_instance_id' })
  approvalInstance: CvTimetableWorkflowInstance | null;
}
