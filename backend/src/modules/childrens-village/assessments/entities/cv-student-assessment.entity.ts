import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvAssessmentTemplate } from './cv-assessment-template.entity';

@Entity('cv_student_assessments')
@Index('IDX_CV_STUDENT_ASSESS_TENANT', ['tenantId', 'studentId'])
export class CvStudentAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'date_conducted', type: 'date' })
  dateConducted: Date;

  @Column({ name: 'assessor_id', type: 'uuid' })
  assessorId: string;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'DRAFT' })
  // DRAFT, IN_PROGRESS, COMPLETED, ARCHIVED
  status: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'overall_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  overallScore: number | null;

  @Column({ name: 'clinical_notes', type: 'text', nullable: true })
  clinicalNotes: string | null;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvAssessmentTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template: CvAssessmentTemplate;
}
