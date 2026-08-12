import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import type { DocumentVersionStatus } from './document-version.entity';

/**
 * An immutable snapshot of an override's JSON Patch delta (RFC 6902), versioned
 * independently of the base document (ADR-011). Milestone 1: schema only.
 */
@Entity('document_override_versions')
@Index(['overrideId', 'versionNo'], { unique: true })
export class DocumentOverrideVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'override_id', type: 'uuid' })
  overrideId: string;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  @Column({ type: 'jsonb' })
  patch: unknown[];

  @Column({ name: 'metadata_overrides', type: 'jsonb', nullable: true })
  metadataOverrides: Record<string, unknown> | null;

  @Column({ length: 20, default: 'draft', type: 'varchar' })
  status: DocumentVersionStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
