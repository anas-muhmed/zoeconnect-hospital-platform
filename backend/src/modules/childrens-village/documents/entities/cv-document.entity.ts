import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';

@Entity('cv_documents')
@Index('IDX_CV_DOCUMENTS_TENANT', ['tenantId'])
export class CvDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ name: 'document_type', type: 'varchar', length: 100 })
  // e.g. BIRTH_CERTIFICATE, IEP_DOCUMENT, MEDICAL_REPORT, THERAPY_ASSESSMENT
  documentType: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'category', type: 'varchar', length: 100, nullable: true })
  // e.g. CLINICAL, ACADEMIC, LEGAL, ADMINISTRATIVE
  category: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
