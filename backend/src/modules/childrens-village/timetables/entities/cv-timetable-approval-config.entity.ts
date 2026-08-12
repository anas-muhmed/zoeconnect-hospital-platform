import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type CvApprovalMode = 'DISABLED' | 'SINGLE' | 'TWO_LEVEL' | 'MULTI_LEVEL';

/**
 * Documented reference values, not an exhaustive/enforced type -- see the
 * `changeType` column note below for why this stays a plain `string`
 * rather than a union: `CvTimetable.changeType` (a genuinely closed set,
 * describing what kind of edit produced one specific timetable version)
 * and this table's `changeType` (an open, admin-extensible key naming
 * *which approval policy applies*, per the design spec's explicit "no
 * hardcoded workflow" requirement) are different concepts that happen to
 * share several string values -- ROUTINE/TEACHER_REPLACEMENT/etc. from
 * CvTimetable's set, plus EXCHANGE/SWAP/SUBSTITUTE which never appear on
 * CvTimetable itself.
 */
export type CvTimetableApprovalChangeTypeExample =
  | 'ROUTINE'
  | 'TEACHER_REPLACEMENT'
  | 'SUBJECT_CHANGE'
  | 'CLASS_MERGE'
  | 'SECTION_SPLIT'
  | 'EMERGENCY'
  | 'EXCHANGE'
  | 'SWAP'
  | 'SUBSTITUTE';

export interface CvTimetableApprovalConfigSteps {
  approverType: 'ROLE' | 'SPECIFIC_USER' | 'CLASS_TEACHER_OF_RECORD';
  approverValue: string;
}

/**
 * Phase 1 (Foundation) -- storage shape only. The engine that CONSUMES
 * this (mapping a config row to a `WorkflowTemplate` instance in the
 * existing `document-platform/workflow-engine`) is Phase 6 work, per the
 * design spec's explicit decision to integrate with that engine rather
 * than build a second one. This table is additive and inert until then:
 * `approvalMode` defaults to 'DISABLED', so no existing behavior changes
 * by its mere existence.
 *
 * `config` (jsonb) holds the remaining configurable dimensions from the
 * design spec Section 6 that don't warrant their own column yet: `steps`
 * (CvTimetableApprovalConfigSteps[]), `autoApproveIfNoApproverAvailable`,
 * `emergencyOverrideRoles`, `escalationTimeoutMinutes`,
 * `reminderIntervalMinutes`, `autoCancelAfterMinutes`, `delegationAllowed`,
 * `approvalValidityDays`, `requesterCannotApproveOwnRequest`.
 */
@Entity('cv_timetable_approval_config')
@Index('IDX_CV_TT_APPROVAL_CONFIG_TENANT_CHANGE_TYPE', ['tenantId', 'changeType'], { unique: true })
export class CvTimetableApprovalConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  // Open string, not a union -- see CvTimetableApprovalChangeTypeExample
  // above for the documented (non-exhaustive) reference values.
  changeType: string;

  @Column({ name: 'approval_mode', type: 'varchar', length: 20, default: 'DISABLED' })
  approvalMode: CvApprovalMode;

  @Column({ name: 'workflow_template_id', type: 'uuid', nullable: true })
  // UPDATED in Phase 6: points to CvTimetableWorkflowTemplate
  // (cv_timetable_workflow_templates), NOT document-platform's
  // hdsp_document_workflow_templates as originally planned -- that table
  // has no tenant_id column at all (confirmed via a full search of
  // document-platform/), so writing CV data into it would break tenant
  // isolation. CV's own template table reuses the exact same
  // WorkflowDefinition type shape instead (see that entity's doc comment
  // and the Phase 6 migration's header for the full reasoning). Soft
  // pointer, no FK, matching how CV already treats this kind of reference.
  workflowTemplateId: string | null;

  @Column({ name: 'config', type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
