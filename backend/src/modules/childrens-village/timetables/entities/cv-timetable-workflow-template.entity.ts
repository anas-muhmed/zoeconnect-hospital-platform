import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { WorkflowDefinition } from '../../../document-platform/workflow-engine/models/workflow-definition';

export type CvWorkflowTemplateStatus = 'draft' | 'published' | 'archived';

/**
 * Phase 6 -- CV's own tenant-scoped approval-chain template, storing the
 * exact same `WorkflowDefinition` shape (states/transitions/hierarchical
 * assignment) as document-platform's `WorkflowTemplateEntity`, imported
 * type-only (zero runtime coupling to that module). See the migration's
 * header comment for why this is a separate, tenant-scoped table rather
 * than a row in `hdsp_document_workflow_templates`.
 *
 * CV's own resolver (`CvTimetableWorkflowService`) supports a practical
 * subset of the DSL: linear traversal only (no `condition`/RuleEngine
 * evaluation), `action` values fixed to `'approve'`/`'reject'`, and
 * `assignTo.roles` limited to two sentinel values recognized specially --
 * `'CLASS_TEACHER_OF_RECORD'` (resolved dynamically via
 * `CvClass.classTeacherId`) and `'ADMIN'` (resolved via the caller holding
 * `CV:TIMETABLE:APPROVE` + an admin role, not a stored user id) --
 * `assignTo.userIds` for a specific user. This matches the confirmed
 * decision to skip broader role-based approval (Principal/Head Teacher
 * tiers) until those roles are confirmed to exist on the platform.
 */
@Entity('cv_timetable_workflow_templates')
@Index('IDX_CV_TT_WF_TEMPLATES_TENANT_CHANGE_TYPE', ['tenantId', 'changeType', 'status'])
export class CvTimetableWorkflowTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'change_type', type: 'varchar', length: 30 })
  changeType: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: CvWorkflowTemplateStatus;

  @Column({ name: 'version_no', type: 'int', default: 1 })
  versionNo: number;

  @Column({ type: 'jsonb' })
  definition: WorkflowDefinition;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
