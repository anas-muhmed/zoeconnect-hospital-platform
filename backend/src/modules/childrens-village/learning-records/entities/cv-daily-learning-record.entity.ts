import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';
import { CvClass } from '../../classes/entities/cv-class.entity';

@Entity('cv_daily_learning_records')
@Index('IDX_CV_DLR_DATE', ['tenantId', 'date'])
@Index('IDX_CV_DLR_STUDENT', ['tenantId', 'studentId', 'date'])
export class CvDailyLearningRecord {
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

  @Column({ name: 'date', type: 'date' })
  date: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  // Mood & Participation
  @Column({ name: 'mood', type: 'varchar', length: 50, nullable: true }) // Happy, Calm, Anxious, Irritable, Emotional
  mood: string | null;

  @Column({ name: 'participation', type: 'varchar', length: 50, nullable: true }) // Excellent, Good, Average, Minimal, None
  participation: string | null;

  // Communication
  @Column({ name: 'communication', type: 'varchar', length: 50, nullable: true }) // Verbal, Gestures, AAC, PECS, Sign
  communication: string | null;

  // ADL (Independent, Prompted, Dependent)
  @Column({ name: 'adl_eating', type: 'varchar', length: 50, nullable: true })
  adlEating: string | null;

  @Column({ name: 'adl_toileting', type: 'varchar', length: 50, nullable: true })
  adlToileting: string | null;

  @Column({ name: 'adl_hand_washing', type: 'varchar', length: 50, nullable: true })
  adlHandWashing: string | null;

  @Column({ name: 'adl_dressing', type: 'varchar', length: 50, nullable: true })
  adlDressing: string | null;

  @Column({ name: 'adl_brushing', type: 'varchar', length: 50, nullable: true })
  adlBrushing: string | null;

  // Behaviour
  @Column({ name: 'behaviour_incidents', type: 'text', nullable: true }) // Tantrum, Aggression, Self Injury, Elopement, Compliance, Transition
  behaviourIncidents: string | null;

  // Therapy Carryover
  @Column({ name: 'therapy_carryover', type: 'text', nullable: true }) // Speech, OT, PT, Psychology, Special Education
  therapyCarryover: string | null;

  // Academics
  @Column({ name: 'curriculum_notes', type: 'text', nullable: true }) // Linked to Curriculum module eventually
  curriculumNotes: string | null;

  @Column({ name: 'homework', type: 'text', nullable: true }) // Home Program
  homework: string | null;

  // Notes
  @Column({ name: 'parent_notes', type: 'text', nullable: true }) // Visible to parent
  parentNotes: string | null;

  @Column({ name: 'teacher_notes', type: 'text', nullable: true }) // Internal only
  teacherNotes: string | null;

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
}
