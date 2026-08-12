import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, DeleteDateColumn
} from 'typeorm';
import { CvStudent } from './cv-student.entity';
import { CvClass } from '../../classes/entities/cv-class.entity';
import { CvAcademicYear } from '../../academic-years/entities/cv-academic-year.entity';

@Entity('cv_student_allocations')
export class CvStudentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'ACTIVE' }) // ACTIVE, TRANSFERRED, PROMOTED, ARCHIVED
  status: string;

  @Column({ name: 'previous_teacher_id', type: 'uuid', nullable: true })
  previousTeacherId: string | null;

  @Column({ name: 'previous_section_id', type: 'uuid', nullable: true })
  previousSectionId: string | null;

  @Column({ name: 'transfer_reason', type: 'text', nullable: true })
  transferReason: string | null;

  @Column({ name: 'promotion_reason', type: 'text', nullable: true })
  promotionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @ManyToOne(() => CvClass)
  @JoinColumn({ name: 'class_id' })
  cvClass: CvClass;

  @ManyToOne(() => CvAcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;
}
