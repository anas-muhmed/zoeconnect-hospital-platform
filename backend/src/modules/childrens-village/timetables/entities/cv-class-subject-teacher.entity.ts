import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { CvClass } from '../../classes/entities/cv-class.entity';
import { CvSubject } from '../../subjects/entities/cv-subject.entity';
import { CvAcademicYear } from '../../academic-years/entities/cv-academic-year.entity';

/**
 * Phase 1 (Foundation) -- declares which teacher(s) are assigned/eligible
 * to teach a subject for a class in a given academic year. Fills a
 * confirmed gap: previously this was only ever inferred from whichever
 * `teacher_id` happened to appear on a `cv_timetable_periods` row. This
 * table becomes the source of truth the Timetable Authoring UI (Phase 3+)
 * uses to populate valid teacher choices, and the Conflict Engine
 * (Phase 4) uses to flag unqualified assignments.
 */
@Entity('cv_class_subject_teachers')
@Index('IDX_CV_CST_CLASS_SUBJECT', ['classId', 'subjectId', 'academicYearId'])
@Index('IDX_CV_CST_TEACHER', ['teacherId', 'tenantId'])
export class CvClassSubjectTeacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string; // the user assigned to teach this class/subject -- unenforced uuid, matching CvTimetablePeriod.teacherId convention

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvClass, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  cvClass: CvClass;

  @ManyToOne(() => CvSubject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subject_id' })
  subject: CvSubject;

  @ManyToOne(() => CvAcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;
}
