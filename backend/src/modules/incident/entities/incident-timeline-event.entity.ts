import {
  Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentTimelineEvent — immutable chronological history of all actions
 * taken on an incident. Written once, never updated, never deleted (unless
 * the incident itself is deleted via CASCADE).
 *
 * eventType examples:
 *   INCIDENT_CREATED | INCIDENT_SUBMITTED | INCIDENT_ACKNOWLEDGED |
 *   ASSIGNED | STATUS_CHANGED | TRIAGE_COMPLETED | CONTAINMENT_NOTED |
 *   INVESTIGATION_STARTED | INVESTIGATION_COMPLETED | RCA_STARTED |
 *   RCA_COMPLETED | CAPA_ADDED | CAPA_STATUS_CHANGED | VERIFICATION_DONE |
 *   INCIDENT_CLOSED | INCIDENT_REOPENED | ATTACHMENT_ADDED |
 *   SLA_BREACHED | NOTE_ADDED
 */
@Entity('incident_timeline_events')
@Index(['incidentId', 'occurredAt'])
@Index(['tenantId', 'occurredAt'])
export class IncidentTimelineEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true })
  actorName: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'NOW()' })
  occurredAt: Date;
}
