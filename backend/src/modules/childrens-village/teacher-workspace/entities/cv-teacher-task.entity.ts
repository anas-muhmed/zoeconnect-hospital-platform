import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_teacher_tasks')
@Index('IDX_CV_TEACHER_TASKS', ['tenantId', 'teacherId', 'status'])
export class CvTeacherTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId: string;

  @Column({ name: 'task_type', type: 'varchar', length: 50 })
  // e.g. IEP_REVIEW, DLR_MISSING, BEHAVIOUR_ALERT, GENERAL_REMINDER
  taskType: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'PENDING' }) // PENDING, COMPLETED, DISMISSED
  status: string;

  @Column({ name: 'related_student_id', type: 'uuid', nullable: true })
  relatedStudentId: string | null;

  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null; // ID of the related IEP or DLR

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
