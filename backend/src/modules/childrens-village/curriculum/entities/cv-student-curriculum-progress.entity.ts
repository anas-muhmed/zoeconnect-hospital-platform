import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvCurriculumObjective } from './cv-curriculum-objective.entity';
import { CvStudent } from '../../students/entities/cv-student.entity';

@Entity('cv_student_curriculum_progress')
@Index('IDX_CV_STUDENT_PROGRESS_TENANT', ['tenantId', 'studentId'])
@Index('IDX_CV_STUDENT_PROGRESS_OBJ', ['tenantId', 'studentId', 'objectiveId'], { unique: true })
export class CvStudentCurriculumProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @Column({ name: 'objective_id', type: 'uuid' })
  objectiveId: string;

  @ManyToOne(() => CvCurriculumObjective)
  @JoinColumn({ name: 'objective_id' })
  objective: CvCurriculumObjective;

  // 'NOT_INTRODUCED', 'INTRODUCED', 'PRACTICING', 'EMERGING', 'ACHIEVED', 'MAINTAINED', 'GENERALIZED'
  @Column({ name: 'status', type: 'varchar', length: 50, default: 'NOT_INTRODUCED' })
  status: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_assessed_by', type: 'uuid', nullable: true })
  lastAssessedBy: string | null;
}
