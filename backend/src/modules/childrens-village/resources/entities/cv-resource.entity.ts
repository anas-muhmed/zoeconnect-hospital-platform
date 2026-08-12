import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_resources')
@Index('IDX_CV_RESOURCES_TENANT', ['tenantId'])
export class CvResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'category', type: 'varchar', length: 50 })
  // e.g. THERAPY_EQUIPMENT, AAC_DEVICE, SENSORY_AID, TEACHING_AID
  category: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'barcode', type: 'varchar', length: 100, nullable: true })
  barcode: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'AVAILABLE' })
  // e.g. AVAILABLE, IN_USE, MAINTENANCE, RETIRED
  status: string;

  @Column({ name: 'lifecycle_state', type: 'jsonb', nullable: true })
  // Tracks purchase date, last maintenance, expected expiry
  lifecycleState: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
