import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentAttachment — file metadata record for the StorageModule abstraction.
 *
 * storageKey: the object ID returned by ObjectRepositoryService.storeFile().
 *   For local storage, this is the relative file path.
 *   For S3/OCI, this is the object key (tenant-namespaced prefix included).
 *
 * thumbnailKey: nullable. Set by IncidentAttachmentService after generating
 *   a thumbnail (images only). Generation is provider-aware — LocalStorage
 *   supports it via sharp; S3 generation is future-work.
 *
 * parentType + parentId: polymorphic reference. One attachment record can
 *   belong to an Incident, Investigation, CAPA, etc. Without FK constraints
 *   on this polymorphic pair (consistent with how CMS uses it), allowing
 *   the attachment list to be queried by context efficiently.
 *
 * attachmentType: 'image' | 'document' | 'audio' | 'video' (audio/video
 *   are future-ready: schema supports them, UI renders a placeholder in v1).
 */
@Entity('incident_attachments')
@Index(['incidentId'])
@Index(['parentType', 'parentId'])
export class IncidentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'parent_type', type: 'varchar', length: 30, default: 'INCIDENT' })
  parentType: string;

  @Column({ name: 'parent_id', type: 'uuid' })
  parentId: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 1000 })
  storageKey: string;

  @Column({ name: 'thumbnail_key', type: 'varchar', length: 1000, nullable: true })
  thumbnailKey: string | null;

  @Column({ name: 'original_name', type: 'varchar', length: 500 })
  originalName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ name: 'attachment_type', type: 'varchar', length: 20, default: 'document' })
  attachmentType: string;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
