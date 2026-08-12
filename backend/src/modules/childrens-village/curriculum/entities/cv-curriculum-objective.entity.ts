import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvCurriculumTopic } from './cv-curriculum-topic.entity';

@Entity('cv_curriculum_objectives')
@Index('IDX_CV_CURRICULUM_OBJECTIVES', ['tenantId', 'topicId'])
export class CvCurriculumObjective {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => CvCurriculumTopic)
  @JoinColumn({ name: 'topic_id' })
  topic: CvCurriculumTopic;

  @Column({ name: 'code', type: 'varchar', length: 50, nullable: true }) // e.g. "MATH-1.1"
  code: string | null;

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
