import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudentAssessment } from './cv-student-assessment.entity';
import { CvAssessmentDomain } from './cv-assessment-domain.entity';

@Entity('cv_student_assessment_scores')
@Index('IDX_CV_S_ASSESS_SCORES_TENANT', ['tenantId'])
export class CvStudentAssessmentScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'assessment_id', type: 'uuid' })
  assessmentId: string;

  @Column({ name: 'domain_id', type: 'uuid' })
  domainId: string;

  @Column({ name: 'item_name', type: 'varchar', length: 255 })
  // e.g. "Can hold pencil with pincer grasp"
  itemName: string;

  @Column({ name: 'raw_score', type: 'int', nullable: true })
  rawScore: number | null;

  @Column({ name: 'value', type: 'varchar', length: 100, nullable: true })
  // Extracted label from the template's scoringScale based on rawScore
  value: string | null;

  @Column({ name: 'observation', type: 'text', nullable: true })
  observation: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudentAssessment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: CvStudentAssessment;

  @ManyToOne(() => CvAssessmentDomain, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domain_id' })
  domain: CvAssessmentDomain;
}
