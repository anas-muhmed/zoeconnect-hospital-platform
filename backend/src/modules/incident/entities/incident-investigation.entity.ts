import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn, VersionColumn
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentInvestigation — one or more investigations per incident.
 *
 * leadId: UUID of the lead investigator (User.id).
 * teamMemberIds: JSON array of additional investigator UUIDs.
 *   The full "team" is always leadId + teamMemberIds.
 *
 * Multiple investigations are possible (e.g., re-investigation after
 * a VERIFICATION rejection or a controlled reopen).
 */
@Entity('incident_investigations')
@Index(['incidentId', 'status'])
@Index(['tenantId', 'leadId'])
export class IncidentInvestigation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @Column({ name: 'team_member_ids', type: 'jsonb', default: '[]' })
  teamMemberIds: string[];

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ name: 'timeline_notes', type: 'text', nullable: true })
  timelineNotes: string | null;

  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @Column({ type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
