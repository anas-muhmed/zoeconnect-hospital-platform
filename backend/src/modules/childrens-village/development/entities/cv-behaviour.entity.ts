import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from '../../students/entities/cv-student.entity';

@Entity('cv_behaviours')
@Index('IDX_CV_BEHAVIOURS_TENANT', ['tenantId', 'studentId', 'date'])
export class CvBehaviour {
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

  @Column({ name: 'date', type: 'date' })
  date: Date;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @Column({ name: 'type', type: 'varchar', length: 50 }) // POSITIVE, INCIDENT
  type: string;

  @Column({ name: 'category', type: 'varchar', length: 100 }) // e.g. "Good Participation", "Aggression"
  category: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'intensity', type: 'varchar', length: 50, nullable: true }) // e.g. "MILD", "SEVERE" (for incidents)
  intensity: string | null;

  @Column({ name: 'action_taken', type: 'text', nullable: true })
  actionTaken: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
