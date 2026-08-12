import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_assessment_templates')
@Index('IDX_CV_ASSESS_TMPL_TENANT', ['tenantId'])
export class CvAssessmentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation - Nullable for Platform-provided templates */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  // e.g. FUNCTIONAL, COGNITIVE, MOTOR, BEHAVIOUR, VOCATIONAL, READINESS
  type: string;

  @Column({ name: 'scoring_scale', type: 'jsonb', nullable: true })
  // e.g. [{ label: 'Independent', score: 3 }, { label: 'Assisted', score: 2 }]
  scoringScale: Record<string, any>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
