import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentTriage — initial triage/assessment stage inserted between
 * Submission and Investigation. Captures:
 *   - Assigned investigator / responsible person
 *   - Priority override
 *   - Response SLA override (can differ from severity default)
 *   - Whether immediate containment is required
 *   - Escalation roles (notified immediately)
 *
 * One incident has exactly one triage record (UNIQUE constraint on incident_id).
 * Updating triage re-emits a TRIAGE_UPDATED timeline event.
 */
@Entity('incident_triage')
@Index(['tenantId'])
export class IncidentTriage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid', unique: true })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'triaged_by_id', type: 'uuid' })
  triagedById: string;

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @Column({ name: 'priority_code', type: 'varchar', length: 20, default: 'ROUTINE' })
  priorityCode: string;

  @Column({ name: 'response_sla_hours', type: 'int', nullable: true })
  responseSlaHours: number | null;

  @Column({ name: 'escalation_required', default: false })
  escalationRequired: boolean;

  @Column({ name: 'escalation_roles', type: 'jsonb', default: '[]' })
  escalationRoles: string[];

  @Column({ name: 'containment_required', default: false })
  containmentRequired: boolean;

  @Column({ name: 'containment_notes', type: 'text', nullable: true })
  containmentNotes: string | null;

  @Column({ name: 'triage_notes', type: 'text', nullable: true })
  triageNotes: string | null;

  @Column({ name: 'triaged_at', type: 'timestamptz', default: () => 'NOW()' })
  triagedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
