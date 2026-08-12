import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CvAcademicYear } from '../../academic-years/entities/cv-academic-year.entity';
import { CvGrade } from '../../curriculum/entities/cv-grade.entity';

@Entity('cv_classes')
export class CvClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId: string | null;

  @ManyToOne(() => CvGrade)
  @JoinColumn({ name: 'grade_id' })
  grade: CvGrade;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string; // e.g., 'Functional Group-1'

  @Column({ name: 'capacity', type: 'int', default: 20 })
  capacity: number;

  @Column({ name: 'age_group', type: 'varchar', length: 100, nullable: true })
  ageGroup: string | null;

  @Column({ name: 'disability_category', type: 'varchar', length: 100, nullable: true })
  disabilityCategory: string | null;

  @Column({ name: 'room_number', type: 'varchar', length: 50, nullable: true })
  roomNumber: string | null;

  @Column({ name: 'color', type: 'varchar', length: 20, nullable: true })
  color: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'class_teacher_id', type: 'uuid', nullable: true })
  classTeacherId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvAcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;
}
