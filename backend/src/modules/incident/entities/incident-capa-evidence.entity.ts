import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { IncidentCapa } from './incident-capa.entity';

@Entity('incident_capa_evidence')
@Index(['capaId'])
export class IncidentCapaEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'capa_id', type: 'uuid' })
  capaId: string;

  @ManyToOne(() => IncidentCapa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'capa_id' })
  capa: IncidentCapa;

  @Column({ name: 'storage_key', type: 'varchar', length: 1000 })
  storageKey: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ name: 'uploaded_by_id', type: 'uuid' })
  uploadedById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
