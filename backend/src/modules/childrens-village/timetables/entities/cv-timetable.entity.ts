import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { CvClass } from '../../classes/entities/cv-class.entity';
import { CvAcademicYear } from '../../academic-years/entities/cv-academic-year.entity';
import { CvTerm } from '../../academic-years/entities/cv-term.entity';

/**
 * Timetable lifecycle, per the approved Enterprise Timetable Design
 * Specification (2026-08-03). Plain varchar rather than a pg enum,
 * matching the majority convention elsewhere in this module
 * (`CvResource.status`, `CvCalendarEvent.type`) so new states can be added
 * without a schema migration.
 */
export type CvTimetableStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'ARCHIVED'
  | 'SUSPENDED';

export type CvTimetableChangeType =
  | 'ROUTINE'
  | 'TEACHER_REPLACEMENT'
  | 'SUBJECT_CHANGE'
  | 'CLASS_MERGE'
  | 'SECTION_SPLIT'
  | 'EMERGENCY';

@Entity('cv_timetables')
export class CvTimetable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'class_id', type: 'uuid' })
  classId: string;

  @Column({ name: 'academic_year_id', type: 'uuid' })
  academicYearId: string;

  @Column({ name: 'term_id', type: 'uuid', nullable: true })
  termId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Phase 1 (Foundation) additions -- versioning/lifecycle/publish
   * metadata. Backfilled for existing rows by migration
   * 1790300000000-CreateCvTimetableFoundation (status derived from the
   * pre-existing `isActive` flag). `isActive` is left untouched and still
   * governs today's `getTimetableForClass()` lookup; the Phase 2 lifecycle
   * work will migrate that read path onto `status` without breaking it.
   */
  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: CvTimetableStatus;

  @Column({ name: 'parent_version_id', type: 'uuid', nullable: true })
  parentVersionId: string | null;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedBy: string | null;

  @Column({ name: 'change_type', type: 'varchar', length: 30, nullable: true })
  changeType: CvTimetableChangeType | null;

  @Column({ name: 'superseded_by_id', type: 'uuid', nullable: true })
  supersededById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => CvClass)
  @JoinColumn({ name: 'class_id' })
  cvClass: CvClass;

  @ManyToOne(() => CvAcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: CvAcademicYear;

  @ManyToOne(() => CvTerm)
  @JoinColumn({ name: 'term_id' })
  term: CvTerm;

  @ManyToOne(() => CvTimetable, { nullable: true })
  @JoinColumn({ name: 'parent_version_id' })
  parentVersion: CvTimetable | null;

  @ManyToOne(() => CvTimetable, { nullable: true })
  @JoinColumn({ name: 'superseded_by_id' })
  supersededBy: CvTimetable | null;
}
