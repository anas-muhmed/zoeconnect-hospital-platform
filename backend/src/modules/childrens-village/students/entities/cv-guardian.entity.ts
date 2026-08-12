import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn
} from 'typeorm';

@Entity('cv_guardians')
export class CvGuardian {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 150 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 150 })
  lastName: string;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'occupation', type: 'varchar', length: 100, nullable: true })
  occupation: string | null;

  @Column({ name: 'preferred_contact_method', type: 'varchar', length: 50, nullable: true })
  preferredContactMethod: string | null;

  @Column({ name: 'parent_portal_enabled', type: 'boolean', default: false })
  parentPortalEnabled: boolean;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null; // Link to user account

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
