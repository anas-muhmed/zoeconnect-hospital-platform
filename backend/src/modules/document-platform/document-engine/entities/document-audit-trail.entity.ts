import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AuditActorType = 'user' | 'system' | 'plugin' | 'ai';

/**
 * DocumentAuditTrailEntity
 * Phase 2.6: Platform Hardening
 * Centralized audit log for all document lifecycle actions, ensuring compliance
 * and full traceability before entering Phase 3 (Workflow & Compliance).
 */
@Entity('document_audit_trails')
export class DocumentAuditTrailEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @Index()
  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 50 })
  actorType: AuditActorType;

  @Column({ name: 'actor_id', type: 'varchar', length: 100, nullable: true })
  actorId: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true })
  actorName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string; // e.g. "ui", "api", "rule-engine"

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown>;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
