import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne,
} from 'typeorm';
import { EicTherapyEnrollment } from './eic-therapy-enrollment.entity';
import { EicDevelopmentalHistory } from './eic-developmental-history.entity';
import { EicPreschoolEnrollment } from './eic-preschool-enrollment.entity';

@Entity('eic_patients')
export class EicPatient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mrn', type: 'varchar', length: 50, unique: true })
  mrn: string;

  @Column({ name: 'salutation', type: 'varchar', length: 20, nullable: true })
  salutation: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'middle_name', type: 'varchar', length: 100, nullable: true })
  middleName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ name: 'full_name', type: 'varchar', length: 300 })
  fullName: string;

  @Column({ name: 'gender', type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ name: 'age_years', type: 'smallint', nullable: true })
  ageYears: number | null;

  @Column({ name: 'age_months', type: 'smallint', nullable: true })
  ageMonths: number | null;

  @Column({ name: 'blood_group', type: 'varchar', length: 10, nullable: true })
  bloodGroup: string | null;

  @Column({ name: 'mobile', type: 'varchar', length: 20, nullable: true })
  mobile: string | null;

  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'city', type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ name: 'state', type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ name: 'pin_code', type: 'varchar', length: 10, nullable: true })
  pinCode: string | null;

  @Column({ name: 'father_name', type: 'varchar', length: 200, nullable: true })
  fatherName: string | null;

  @Column({ name: 'mother_name', type: 'varchar', length: 200, nullable: true })
  motherName: string | null;

  @Column({ name: 'parent_contact', type: 'varchar', length: 20, nullable: true })
  parentContact: string | null;

  @Column({ name: 'parent_email', type: 'varchar', length: 150, nullable: true })
  parentEmail: string | null;

  @Column({ name: 'referring_doctor_code', type: 'varchar', length: 50, nullable: true })
  referringDoctorCode: string | null;

  @Column({ name: 'referring_doctor_name', type: 'varchar', length: 200, nullable: true })
  referringDoctorName: string | null;

  @Column({ name: 'his_synced_at', type: 'timestamptz', nullable: true })
  hisSyncedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Branch this patient belongs to (Oracle orgstructure.id). Defaults to '2' (ALMAS). */
  @Column({ name: 'branch_id', type: 'varchar', length: 30, nullable: true, default: '2' })
  branchId: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A8) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema. Root of the
   * EIC ownership chain — all other EIC tables derive tenant via a join
   * back to this table (see HYBRID_ARCHITECTURE_LOG.md's A8 relationship
   * audit).
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => EicTherapyEnrollment, (e) => e.patient)
  enrollments: EicTherapyEnrollment[];

  @OneToOne(() => EicDevelopmentalHistory, (d) => d.patient)
  developmentalHistory: EicDevelopmentalHistory;

  @OneToMany(() => EicPreschoolEnrollment, (p) => p.patient)
  preschoolEnrollments: EicPreschoolEnrollment[];
}
