import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('cv_students')
export class CvStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'registration_number', type: 'varchar', length: 100, nullable: true })
  registrationNumber: string | null;

  @Column({ name: 'admission_number', type: 'varchar', length: 100, nullable: true })
  admissionNumber: string | null;

  @Column({ name: 'student_code', type: 'varchar', length: 100, nullable: true })
  studentCode: string | null;

  @Column({ name: 'admission_status', type: 'varchar', length: 50, default: 'PENDING' })
  admissionStatus: string;

  @Column({ name: 'student_status', type: 'varchar', length: 50, default: 'ACTIVE' })
  studentStatus: string;

  @Column({ name: 'first_name', type: 'varchar', length: 150 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 150 })
  lastName: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'parent_name', type: 'varchar', length: 255, nullable: true })
  parentName: string | null;

  @Column({ name: 'parent_contact', type: 'varchar', length: 100, nullable: true })
  parentContact: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 1000, nullable: true })
  photoUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
