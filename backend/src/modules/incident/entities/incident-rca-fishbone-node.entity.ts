import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { IncidentRca } from './incident-rca.entity';

/**
 * IncidentRcaFishboneNode — one cause node in the Fishbone (Ishikawa) diagram.
 *
 * category: 'PEOPLE' | 'PROCESS' | 'EQUIPMENT' | 'ENVIRONMENT' | 'POLICY' | 'COMMUNICATION'
 * parentId: nullable self-reference for hierarchical sub-causes within a bone.
 * layout: JSONB for diagram coordinate data (x, y position, etc.) — kept as
 *   JSONB because layout is genuinely UI-dynamic and schema-free.
 */
@Entity('incident_rca_fishbone_nodes')
@Index(['rcaId', 'category'])
export class IncidentRcaFishboneNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'rca_id', type: 'uuid' })
  rcaId: string;

  @ManyToOne(() => IncidentRca, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rca_id' })
  rca: IncidentRca;

  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ name: 'cause_text', type: 'text' })
  causeText: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  layout: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
