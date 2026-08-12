import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from './cv-student.entity';
import { CvGuardian } from './cv-guardian.entity';

@Entity('cv_student_guardian_links')
export class CvStudentGuardianLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'guardian_id', type: 'uuid' })
  guardianId: string;

  @Column({ name: 'relationship', type: 'varchar', length: 100 })
  relationship: string; // e.g. 'Mother', 'Father', 'Legal Guardian'

  @Column({ name: 'guardian_type', type: 'varchar', length: 50, nullable: true })
  guardianType: string | null; // e.g. 'Biological', 'Adoptive', 'Foster'

  @Column({ name: 'is_primary_guardian', type: 'boolean', default: false })
  isPrimaryGuardian: boolean;

  @Column({ name: 'is_emergency_contact', type: 'boolean', default: false })
  isEmergencyContact: boolean;

  @Column({ name: 'receives_notifications', type: 'boolean', default: true })
  receivesNotifications: boolean;

  @Column({ name: 'receives_reports', type: 'boolean', default: true })
  receivesReports: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;

  @ManyToOne(() => CvGuardian)
  @JoinColumn({ name: 'guardian_id' })
  guardian: CvGuardian;
}
