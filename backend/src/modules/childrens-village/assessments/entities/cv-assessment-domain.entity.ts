import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvAssessmentTemplate } from './cv-assessment-template.entity';

@Entity('cv_assessment_domains')
@Index('IDX_CV_ASSESS_DOMAIN_TENANT', ['tenantId'])
export class CvAssessmentDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation - Nullable for Platform-provided templates */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string; // e.g. "Fine Motor Skills"

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sequence_order', type: 'int', default: 1 })
  sequenceOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvAssessmentTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: CvAssessmentTemplate;
}
