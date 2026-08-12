import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * A logical document (e.g. a Patient Registration form, eventually a Consent
 * Form, Certificate, etc.). This is the generic Document Engine abstraction
 * (ADR-002 / Phase 4A §2.2) — `documentTypeId` is a DocumentTypeRegistry key
 * ('form' for Milestone 1's only consumer), never a hardcoded form-specific
 * shape. dynamic-forms (Milestone 3+) is a consumer of this table, not an owner
 * of a parallel one.
 */
@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_type_id', length: 50 })
  documentTypeId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 50 })
  category: string;

  @Column({ name: 'is_multi_branch', default: true })
  isMultiBranch: boolean;

  @Column({ name: 'current_published_version_id', type: 'uuid', nullable: true })
  currentPublishedVersionId: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
