import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_reports')
@Index('IDX_CV_REPORTS_TENANT', ['tenantId'])
export class CvReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'type', type: 'varchar', length: 50 })
  // e.g. STUDENT_PROGRESS, ATTENDANCE, CLASS_REGISTER, BEHAVIOUR
  type: string;

  @Column({ name: 'config', type: 'jsonb' })
  // Stores filters, columns, sorting
  config: Record<string, any>;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'is_shared', type: 'boolean', default: false })
  isShared: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
