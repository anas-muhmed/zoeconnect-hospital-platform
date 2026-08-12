import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn
} from 'typeorm';
import { CvStudent } from './cv-student.entity';

@Entity('cv_student_medical_profiles')
export class CvStudentMedicalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'blood_group', type: 'varchar', length: 10, nullable: true })
  bloodGroup: string | null;

  @Column({ name: 'allergies', type: 'text', nullable: true })
  allergies: string | null;

  @Column({ name: 'specific_conditions', type: 'text', nullable: true })
  specificConditions: string | null;

  @Column({ name: 'disability_type', type: 'varchar', length: 100, nullable: true })
  disabilityType: string | null;

  @Column({ name: 'disability_percentage', type: 'int', nullable: true })
  disabilityPercentage: number | null;

  @Column({ name: 'medication_notes', type: 'text', nullable: true })
  medicationNotes: string | null;

  @Column({ name: 'dietary_requirements', type: 'text', nullable: true })
  dietaryRequirements: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @OneToOne(() => CvStudent)
  @JoinColumn({ name: 'student_id' })
  student: CvStudent;
}
