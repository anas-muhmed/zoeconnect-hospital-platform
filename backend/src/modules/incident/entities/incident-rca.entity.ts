import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn, VersionColumn
} from 'typeorm';
import { Incident } from './incident.entity';
import { IncidentInvestigation } from './incident-investigation.entity';

/**
 * IncidentRca — Root Cause Analysis record.
 *
 * method: 'FIVE_WHY' | 'FISHBONE' | 'FAULT_TREE' | 'BOWTIE'
 *   Only FIVE_WHY and FISHBONE are implemented in v1; others are
 *   reserved for future methods without schema changes.
 *
 * One incident may have multiple RCA records (e.g., re-investigation
 * or parallel analysis by different leads).
 */
@Entity('incident_rca')
@Index(['incidentId', 'status'])
export class IncidentRca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'investigation_id', type: 'uuid', nullable: true })
  investigationId: string | null;

  @ManyToOne(() => IncidentInvestigation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'investigation_id' })
  investigation: IncidentInvestigation | null;

  @Column({ type: 'varchar', length: 20, default: 'FIVE_WHY' })
  method: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause: string | null;

  @Column({ type: 'varchar', length: 20, default: 'IN_PROGRESS' })
  status: string;

  @Column({ name: 'conducted_by_id', type: 'uuid' })
  conductedById: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
