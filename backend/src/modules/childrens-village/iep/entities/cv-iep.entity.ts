import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';
import { CvAcademicYear } from '../../academic-years/entities/cv-academic-year.entity';

@Entity('cv_ieps')
@Index('IDX_CV_IEPS_TENANT', ['tenantId', 'studentId', 'status'])
export class CvIep {
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

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => CvAcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;

  // Lifecycle: DRAFT, UNDER_REVIEW, APPROVED, ACTIVE, REVIEW_DUE, ARCHIVED
  @Column({ name: 'status', type: 'varchar', length: 50, default: 'DRAFT' })
  status: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null; // e.g. Clinical Director ID

  @Column({ name: 'approval_date', type: 'date', nullable: true })
  approvalDate: Date | null;

  @Column({ name: 'change_reason', type: 'text', nullable: true })
  changeReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
