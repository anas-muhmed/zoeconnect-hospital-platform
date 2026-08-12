import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { CvTimetable } from './cv-timetable.entity';
import { CvSubject } from '../../subjects/entities/cv-subject.entity';
import { CvClassroom } from '../../resources/entities/cv-classroom.entity';

@Entity('cv_timetable_periods')
export class CvTimetablePeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'timetable_id', type: 'uuid' })
  timetableId: string;

  @Column({ name: 'day_of_week', type: 'varchar', length: 20 })
  dayOfWeek: string; // e.g. MONDAY, TUESDAY

  @Column({ name: 'start_time', type: 'time' })
  startTime: string; // '09:00:00'

  @Column({ name: 'end_time', type: 'time' })
  endTime: string; // '09:45:00'

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string; // The user assigned to teach this period

  @Column({ name: 'room', type: 'varchar', length: 100, nullable: true })
  room: string | null; // free-text legacy field, kept for compatibility -- prefer resourceId below

  /**
   * Phase 1 (Foundation) additions. `resourceId` FKs to the EXISTING
   * `cv_classrooms` table (rooms) rather than a new generic resources
   * table -- see the migration's header comment for why. `room` (above)
   * is left untouched so existing reads/writes keep working unchanged;
   * new authoring flows should prefer `resourceId` going forward.
   */
  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'period_number', type: 'int', nullable: true })
  periodNumber: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvTimetable)
  @JoinColumn({ name: 'timetable_id' })
  timetable: CvTimetable;

  @ManyToOne(() => CvSubject)
  @JoinColumn({ name: 'subject_id' })
  subject: CvSubject;

  @ManyToOne(() => CvClassroom, { nullable: true })
  @JoinColumn({ name: 'resource_id' })
  resource: CvClassroom | null;
}
