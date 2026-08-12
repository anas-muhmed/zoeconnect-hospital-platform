import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('platform_ai_audit_trail')
export class AiAuditTrailEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  hospitalId?: string;

  @Column({ nullable: true })
  departmentId?: string;

  @Column({ nullable: true })
  organizationId?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  capability: string;

  @Column()
  providerId: string;

  @Column({ nullable: true })
  fallbackProviderId?: string;

  @Column({ nullable: true })
  model?: string;

  @Column({ nullable: true })
  promptVersionId?: string;

  @Column('simple-array', { nullable: true })
  knowledgeSourcesUsed: string[];

  @Column({ type: 'int', default: 0 })
  retrievedDocumentsCount: number;

  @Column({ type: 'int', default: 0 })
  inputTokens: number;

  @Column({ type: 'int', default: 0 })
  outputTokens: number;

  @Column({ type: 'boolean', default: false })
  isCached: boolean;

  @Column({ type: 'int' })
  executionTimeMs: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  estimatedCost?: number;

  @Column()
  responseStatus: 'SUCCESS' | 'ERROR' | 'FILTERED' | 'RATE_LIMITED';

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  sessionId?: string;

  // Hashes for integrity/compliance
  @Column({ nullable: true })
  requestHash?: string;

  @Column({ nullable: true })
  responseHash?: string;

  // Human Feedback
  @Column({ type: 'enum', enum: ['ACCEPTED', 'REJECTED', 'EDITED', 'IGNORED', 'REGENERATED'], nullable: true })
  userFeedback?: 'ACCEPTED' | 'REJECTED' | 'EDITED' | 'IGNORED' | 'REGENERATED';

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @CreateDateColumn()
  timestamp: Date;
}
