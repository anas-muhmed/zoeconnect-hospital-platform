import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn
} from 'typeorm';
import { CvDocument } from './cv-document.entity';

@Entity('cv_document_versions')
@Index('IDX_CV_DOCUMENT_VERSIONS_TENANT', ['tenantId'])
export class CvDocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stage B Tenant Isolation */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber: number;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId: string; // References the HDSP Object Repository

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100, nullable: true })
  contentType: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: number | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: Date | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CvDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: CvDocument;
}
