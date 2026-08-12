import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvIepGoal } from '../../iep/entities/cv-iep-goal.entity';

@Entity('cv_eic_goal_links')
@Index('IDX_CV_EIC_GOAL_LINKS_TENANT', ['tenantId'])
export class CvEicGoalLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'cv_goal_id', type: 'uuid' })
  cvGoalId: string;

  @Column({ name: 'eic_goal_id', type: 'uuid' })
  eicGoalId: string;

  @Column({ name: 'linked_by', type: 'uuid' })
  linkedBy: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvIepGoal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cv_goal_id' })
  cvGoal: CvIepGoal;
}
