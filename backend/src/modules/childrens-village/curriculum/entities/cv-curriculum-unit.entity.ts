import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvGrade } from './cv-grade.entity';
import { CvSubject } from '../../subjects/entities/cv-subject.entity';

@Entity('cv_curriculum_units')
@Index('IDX_CV_CURRICULUM_UNITS', ['tenantId', 'gradeId', 'subjectId'])
export class CvCurriculumUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'grade_id', type: 'uuid' })
  gradeId: string;

  @ManyToOne(() => CvGrade)
  @JoinColumn({ name: 'grade_id' })
  grade: CvGrade;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @ManyToOne(() => CvSubject)
  @JoinColumn({ name: 'subject_id' })
  subject: CvSubject;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sequence_order', type: 'int', default: 1 })
  sequenceOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
