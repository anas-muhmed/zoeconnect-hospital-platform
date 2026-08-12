import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvResource } from './cv-resource.entity';

@Entity('cv_resource_bookings')
@Index('IDX_CV_RESOURCE_BOOKINGS_TENANT', ['tenantId'])
export class CvResourceBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ name: 'booked_by', type: 'uuid' })
  bookedBy: string;

  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamp' })
  endTime: Date;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'CONFIRMED' })
  // e.g. PENDING, CONFIRMED, CANCELLED, COMPLETED
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvResource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: CvResource;
}
