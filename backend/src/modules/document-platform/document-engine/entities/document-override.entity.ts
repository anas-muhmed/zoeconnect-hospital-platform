import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DocumentOverrideScope = 'branch' | 'department';

/**
 * A branch/department override "slot" for a document (ADR-011: multi-branch
 * inheritance model — override is a delta, never a duplicated schema). The
 * actual patch content lives versioned in DocumentOverrideVersionEntity, mirroring
 * how DocumentVersionEntity versions the base document. Milestone 1 ships schema
 * only; override CRUD/resolution logic is Milestone 5.
 */
@Entity('document_overrides')
@Index(['documentId', 'branchId', 'departmentCode'])
export class DocumentOverrideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ length: 20 })
  scope: DocumentOverrideScope;

  /** Oracle orgstructure id — plain indexed string, not FK-constrained, matching
   * the existing ZoeConnect convention (branch.service.ts) since branch is HIS-sourced
   * reference data, not a local table. */
  @Column({ name: 'branch_id', type: 'varchar', length: 30, nullable: true })
  branchId: string | null;

  /** Oracle HIS department code — same rationale as branchId. */
  @Column({ name: 'department_code', type: 'varchar', length: 50, nullable: true })
  departmentCode: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
