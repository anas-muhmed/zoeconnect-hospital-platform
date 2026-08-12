import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
} from 'typeorm';

/** Drug Indenting integration. Ports `user_request_quotas` (per-doctor quarterly submission limit). Tenant-scoped. */
@Entity('drug_user_request_quotas')
export class UserRequestQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'quarterly_limit', type: 'int', default: 10 })
  quarterlyLimit: number;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
