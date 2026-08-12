import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvCurriculumUnit } from './cv-curriculum-unit.entity';

@Entity('cv_curriculum_topics')
@Index('IDX_CV_CURRICULUM_TOPICS', ['tenantId', 'unitId'])
export class CvCurriculumTopic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @ManyToOne(() => CvCurriculumUnit)
  @JoinColumn({ name: 'unit_id' })
  unit: CvCurriculumUnit;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sequence_order', type: 'int', default: 1 })
  sequenceOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
