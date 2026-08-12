import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, JoinColumn, ManyToOne, Index } from 'typeorm';
import { DocumentInstanceEntity } from './document-instance.entity';

/**
 * DocumentSnapshotEntity
 * Phase 2.5: Runtime Execution Platform
 * 
 * Represents an immutable, append-only, point-in-time snapshot of a document
 * upon finalization. It guarantees that any future changes to the DocumentVersion's
 * schema or plugin behaviors will NOT affect this record.
 */
@Entity('document_snapshots')
export class DocumentSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @ManyToOne(() => DocumentInstanceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance: DocumentInstanceEntity;

  @Column({ name: 'template_version_id', type: 'uuid', nullable: true })
  templateVersionId: string;

  @Column({ name: 'template_version_string', type: 'varchar', length: 50, nullable: true })
  templateVersionString: string;

  @Column({ name: 'document_revision', type: 'int', default: 1 })
  documentRevision: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ name: 'execution_context_version', type: 'varchar', length: 50, nullable: true })
  executionContextVersion: string;

  @Column({ name: 'rule_engine_version', type: 'varchar', length: 50, nullable: true })
  ruleEngineVersion: string;

  @Column({ name: 'plugin_versions', type: 'jsonb', nullable: true })
  pluginVersions: Record<string, string>;

  @Column({ name: 'snapshot_reason', type: 'varchar', length: 100, nullable: true })
  snapshotReason: string;

  @Column({ type: 'jsonb' })
  schemaPayload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  contextPayload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  answersPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
