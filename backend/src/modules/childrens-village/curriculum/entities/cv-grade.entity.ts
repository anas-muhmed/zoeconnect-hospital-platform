import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvCurriculumFramework } from './cv-curriculum-framework.entity';

@Entity('cv_grades')
@Index('IDX_CV_GRADES_TENANT', ['tenantId', 'frameworkId'])
export class CvGrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'framework_id', type: 'uuid' })
  frameworkId: string;

  @ManyToOne(() => CvCurriculumFramework)
  @JoinColumn({ name: 'framework_id' })
  framework: CvCurriculumFramework;

  @Column({ name: 'name', type: 'varchar', length: 100 }) // e.g. "Pre-K", "Grade 1"
  name: string;

  @Column({ name: 'level_sequence', type: 'int', default: 1 }) // For sorting grades
  levelSequence: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
