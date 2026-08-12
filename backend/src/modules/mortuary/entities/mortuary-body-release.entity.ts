import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A). Ports `body_releases`,
 * tenant-scoped. `nocDocumentObjectKey`/`legalDocumentsObjectKey` replace
 * the old TEXT URL/path columns (Stage E, object-repository).
 */
@Entity('mortuary_body_releases')
export class MortuaryBodyRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'body_id', type: 'uuid' })
  bodyId: string;

  @Column({ name: 'release_type', type: 'varchar', length: 50 })
  releaseType: string;

  @Column({ name: 'taken_by', type: 'varchar', length: 255, nullable: true })
  takenBy: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  relationship: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'contact_number', type: 'varchar', length: 50, nullable: true })
  contactNumber: string | null;

  @Column({ name: 'police_station', type: 'varchar', length: 255, nullable: true })
  policeStation: string | null;

  @Column({ name: 'si_name', type: 'varchar', length: 255, nullable: true })
  siName: string | null;

  @Column({ name: 'noc_document_object_key', type: 'text', nullable: true })
  nocDocumentObjectKey: string | null;

  @Column({ name: 'legal_documents_object_key', type: 'text', nullable: true })
  legalDocumentsObjectKey: string | null;

  @Column({ name: 'release_date_time', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  releaseDateTime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
