import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { IncidentCapa } from './incident-capa.entity';
import { Incident } from './incident.entity';

/**
 * IncidentVerification — quality team verification outcome for a CAPA.
 *
 * outcome: 'APPROVED' | 'REJECTED' | 'NEED_MORE_EVIDENCE'
 *
 * When outcome is 'REJECTED' or 'NEED_MORE_EVIDENCE', IncidentVerificationService
 * automatically reopens the CAPA (sets status to 'REOPENED') and emits a
 * VERIFICATION_REJECTED timeline event on the incident.
 *
 * Multiple verification records may exist per CAPA (each attempt is a new row).
 */
@Entity('incident_verification')
@Index(['capaId', 'verifiedAt'])
@Index(['incidentId'])
export class IncidentVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'capa_id', type: 'uuid' })
  capaId: string;

  @ManyToOne(() => IncidentCapa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'capa_id' })
  capa: IncidentCapa;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ type: 'varchar', length: 30 })
  outcome: string;

  @Column({ name: 'verified_by_id', type: 'uuid' })
  verifiedById: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', default: () => 'NOW()' })
  verifiedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
