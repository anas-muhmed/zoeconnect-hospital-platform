import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, VersionColumn,
} from 'typeorm';

export type DocumentInstanceStatus = 
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'under_review'
  | 'approved'
  | 'locked'
  | 'archived'
  | string; // Support dynamic workflow states (e.g. 'doctor_review')

/**
 * A filled/issued instance of a published document version (e.g. one patient's
 * completed Registration form). Milestone 1 ships schema only — fill/submit/
 * finalize application logic is Milestone 4 (Runtime), per
 * docs/architecture/MILESTONE_PLAN.md.
 */
@Entity('document_instances')
@Index(['patientId'])
export class DocumentInstanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_version_id', type: 'uuid' })
  documentVersionId: string;

  @Column({ name: 'override_version_id', type: 'uuid', nullable: true })
  overrideVersionId: string | null;

  @Column({ name: 'branch_id', type: 'varchar', length: 30, nullable: true })
  branchId: string | null;

  @Column({ name: 'department_code', type: 'varchar', length: 50, nullable: true })
  departmentCode: string | null;

  /** HIS-sourced identifiers — plain strings, matching existing ZoeConnect convention. */
  @Column({ name: 'patient_id', type: 'varchar', length: 50, nullable: true })
  patientId: string | null;

  @Column({ name: 'visit_id', type: 'varchar', length: 50, nullable: true })
  visitId: string | null;

  @Column({ name: 'encounter_id', type: 'varchar', length: 50, nullable: true })
  encounterId: string | null;

  @Column({ type: 'jsonb' })
  answers: Record<string, unknown>;

  @Column({ length: 20, default: 'in_progress' })
  status: DocumentInstanceStatus;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
