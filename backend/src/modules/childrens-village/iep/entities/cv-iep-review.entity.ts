import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvIepGoal } from './cv-iep-goal.entity';

@Entity('cv_iep_reviews')
@Index('IDX_CV_IEP_REVIEWS_TENANT', ['tenantId', 'goalId'])
export class CvIepReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'goal_id', type: 'uuid' })
  goalId: string;

  @ManyToOne(() => CvIepGoal)
  @JoinColumn({ name: 'goal_id' })
  goal: CvIepGoal;

  @Column({ name: 'review_date', type: 'date' })
  reviewDate: Date;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId: string;

  @Column({ name: 'progress_notes', type: 'text' })
  progressNotes: string;

  @Column({ name: 'status_update', type: 'varchar', length: 50, nullable: true })
  statusUpdate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
