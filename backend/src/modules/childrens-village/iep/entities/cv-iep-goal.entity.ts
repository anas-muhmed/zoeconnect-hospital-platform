import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvIep } from './cv-iep.entity';
import { CvIepDomain } from './cv-iep-domain.entity';

@Entity('cv_iep_goals')
@Index('IDX_CV_IEP_GOALS_TENANT', ['tenantId', 'iepId'])
export class CvIepGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'iep_id', type: 'uuid' })
  iepId: string;

  @ManyToOne(() => CvIep)
  @JoinColumn({ name: 'iep_id' })
  iep: CvIep;

  @Column({ name: 'domain_id', type: 'uuid' })
  domainId: string;

  @ManyToOne(() => CvIepDomain)
  @JoinColumn({ name: 'domain_id' })
  domain: CvIepDomain;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'baseline', type: 'text', nullable: true })
  baseline: string | null;

  @Column({ name: 'target', type: 'text', nullable: true })
  target: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'NOT_STARTED' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
