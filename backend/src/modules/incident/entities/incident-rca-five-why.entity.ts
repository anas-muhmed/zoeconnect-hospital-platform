import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { IncidentRca } from './incident-rca.entity';

/**
 * IncidentRcaFiveWhy — one entry per "Why" in the Five Why analysis.
 * whyNumber: 1–5, unique per RCA (enforced by DB UNIQUE constraint).
 * because: the answer/cause identified for this Why.
 */
@Entity('incident_rca_five_whys')
@Unique(['rcaId', 'whyNumber'])
@Index(['rcaId', 'whyNumber'])
export class IncidentRcaFiveWhy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'rca_id', type: 'uuid' })
  rcaId: string;

  @ManyToOne(() => IncidentRca, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rca_id' })
  rca: IncidentRca;

  @Column({ name: 'why_number', type: 'smallint' })
  whyNumber: number;

  @Column({ name: 'why_text', type: 'text' })
  whyText: string;

  @Column({ type: 'text', nullable: true })
  because: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
