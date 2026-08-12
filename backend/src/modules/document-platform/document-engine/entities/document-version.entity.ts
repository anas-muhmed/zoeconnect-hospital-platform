import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';

export type DocumentVersionStatus =
  | 'draft' | 'in_review' | 'approved' | 'published' | 'archived' | 'retired';

/**
 * An immutable-once-published schema snapshot (ADR-001: Schema-First
 * Architecture; ADR-009: schema migration strategy anchors on this table's
 * `payload` + `schemaVersion` inside it). Milestone 1 only implements
 * create/read of draft versions — publish/workflow transitions are Milestone 5
 * (Configurable Workflow Engine, ADR-008).
 */
@Entity('document_versions')
@Index(['documentId', 'versionNo'], { unique: true })
export class DocumentVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  @Column({ length: 50, default: 'draft' })
  status: string;


  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
