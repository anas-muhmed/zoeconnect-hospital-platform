import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';

@Entity('cv_therapy_carryovers')
@Index('IDX_CV_THERAPY_CARRYOVERS_TENANT', ['tenantId', 'studentId'])
export class CvTherapyCarryover {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId: string | null;

  @Column({ name: 'eic_goal_id', type: 'uuid', nullable: true })
  eicGoalId: string | null;

  @Column({ name: 'assigned_by', type: 'uuid' })
  // Therapist ID
  assignedBy: string;

  @Column({ name: 'activity_description', type: 'text' })
  activityDescription: string;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'ACTIVE' })
  // e.g. ACTIVE, COMPLETED, ARCHIVED
  status: string;

  @Column({ name: 'teacher_completion_notes', type: 'text', nullable: true })
  teacherCompletionNotes: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;
}
