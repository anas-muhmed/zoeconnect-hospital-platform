import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';
import { CvClass } from '../../classes/entities/cv-class.entity';
import { CvTimetablePeriod } from '../../timetables/entities/cv-timetable-period.entity';

@Entity('cv_student_attendance')
@Index('IDX_CV_ATTENDANCE_DATE', ['tenantId', 'date'])
@Index('IDX_CV_ATTENDANCE_STUDENT', ['tenantId', 'studentId', 'date'])
export class CvStudentAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ name: 'period_id', type: 'uuid', nullable: true })
  periodId: string | null; // For period-level attendance, nullable for full day attendance

  @Column({ name: 'date', type: 'date' })
  date: Date;

  @Column({ name: 'status', type: 'varchar', length: 50 })
  // e.g. PRESENT, ABSENT, MEDICAL_LEAVE, HALF_DAY, LATE, EXCUSED, HOLIDAY, FIELD_TRIP, THERAPY_SESSION, SCHOOL_EVENT
  status: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @ManyToOne(() => CvClass)
  @JoinColumn({ name: 'class_id' })
  cvClass: CvClass;

  @ManyToOne(() => CvTimetablePeriod)
  @JoinColumn({ name: 'period_id' })
  period: CvTimetablePeriod;
}
