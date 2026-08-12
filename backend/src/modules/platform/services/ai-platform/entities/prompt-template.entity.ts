import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';

@Entity('platform_prompt_templates')
export class PromptTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int' })
  version: number;

  @Column()
  semanticVersion: string; // e.g., '1.2.0'

  @Column({ type: 'enum', enum: ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED'], default: 'DRAFT' })
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'DEPRECATED' | 'ARCHIVED';

  @Column({ type: 'text' })
  template: string;

  @Column('simple-array')
  variables: string[];

  @Column({ type: 'jsonb', nullable: true })
  expectedSchema?: any;

  @Column({ type: 'enum', enum: AiCapabilityType, array: true })
  supportedCapabilities: AiCapabilityType[];

  @Column({ type: 'float', nullable: true })
  temperature?: number;

  @Column({ type: 'int', nullable: true })
  maxTokens?: number;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column()
  owner: string;

  @Column({ nullable: true })
  reviewerId?: string;

  @Column({ type: 'timestamp', nullable: true })
  approvalTimestamp?: Date;

  @Column({ type: 'float', default: 100.0 })
  rolloutPercentage: number;

  @Column('simple-array', { nullable: true })
  supportedProviders?: string[];

  @Column({ nullable: true })
  validationProfileId?: string;

  @Column({ type: 'float', nullable: true })
  evaluationScore?: number; // 0-100

  @Column({ default: false })
  isProductionReady: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
