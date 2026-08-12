import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';
import { CvTimetablePeriod } from './cv-timetable-period.entity';

@Entity('cv_student_schedule_overrides')
export class CvStudentScheduleOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'date', type: 'date', nullable: true })
  date: Date | null; // If null, applies weekly based on day_of_week

  @Column({ name: 'day_of_week', type: 'varchar', length: 20, nullable: true })
  dayOfWeek: string | null;

  @Column({ name: 'period_id', type: 'uuid', nullable: true })
  periodId: string | null; // The regular period being overridden

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'reason', type: 'varchar', length: 255 })
  reason: string; // e.g., 'Speech Therapy', 'OT', 'Doctor Appointment'

  @Column({ name: 'override_teacher_id', type: 'uuid', nullable: true })
  overrideTeacherId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @ManyToOne(() => CvTimetablePeriod)
  @JoinColumn({ name: 'period_id' })
  period: CvTimetablePeriod;
}
