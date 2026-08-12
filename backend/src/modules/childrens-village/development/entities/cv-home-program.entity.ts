import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';
import { CvGuardian } from '../../students/entities/cv-guardian.entity';

@Entity('cv_home_programs')
@Index('IDX_CV_HOME_PROGRAMS_TENANT', ['tenantId', 'studentId', 'status'])
export class CvHomeProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'frequency', type: 'varchar', length: 100, nullable: true }) // e.g. "Daily", "Weekly"
  frequency: string | null;

  @Column({ name: 'responsible_guardian_id', type: 'uuid', nullable: true })
  responsibleGuardianId: string | null;

  @ManyToOne(() => CvGuardian)
  @JoinColumn({ name: 'responsible_guardian_id' })
  responsibleGuardian: CvGuardian;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'ASSIGNED' }) // ASSIGNED, IN_PROGRESS, COMPLETED
  status: string;

  @Column({ name: 'assigned_by', type: 'uuid' }) // teacher/therapist ID
  assignedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
