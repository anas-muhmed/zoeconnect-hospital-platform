import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SubjectCategory {
  ACADEMIC = 'ACADEMIC',
  FUNCTIONAL = 'FUNCTIONAL',
  THERAPEUTIC = 'THERAPEUTIC',
  CREATIVE = 'CREATIVE',
  OTHER = 'OTHER',
}

@Entity('cv_subjects')
export class CvSubject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'code', type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({
    name: 'category',
    type: 'enum',
    enum: SubjectCategory,
    default: SubjectCategory.ACADEMIC,
  })
  category: SubjectCategory;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'hospital_id', type: 'uuid', nullable: true })
  hospitalId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
