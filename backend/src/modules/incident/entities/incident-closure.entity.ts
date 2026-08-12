import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Incident } from './incident.entity';

/**
 * IncidentClosure — the final closure record for an incident.
 *
 * One incident has exactly one closure record (UNIQUE constraint).
 * finalRiskScore/Level: re-assessed at closure (should be lower than initial
 *   risk after CAPA completion — for NABH/JCI audit evidence).
 *
 * residualRiskAccepted: if TRUE, residualRiskNotes explains why any remaining
 *   risk is accepted by clinical leadership.
 *
 * After closure, the incident status becomes CLOSED and the record is
 * immutable — further changes require a controlled reopen via the
 * INCIDENT:INCIDENTS:CLOSE permission gate.
 */
@Entity('incident_closure')
@Unique(['incidentId'])
@Index(['tenantId', 'closedAt'])
export class IncidentClosure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'closure_notes', type: 'text' })
  closureNotes: string;

  @Column({ name: 'lessons_learned', type: 'text', nullable: true })
  lessonsLearned: string | null;

  @Column({ name: 'final_risk_score', type: 'smallint', nullable: true })
  finalRiskScore: number | null;

  @Column({ name: 'final_risk_level', type: 'varchar', length: 20, nullable: true })
  finalRiskLevel: string | null;

  @Column({ name: 'residual_risk_accepted', default: false })
  residualRiskAccepted: boolean;

  @Column({ name: 'residual_risk_notes', type: 'text', nullable: true })
  residualRiskNotes: string | null;

  @Column({ name: 'closed_by_id', type: 'uuid' })
  closedById: string;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', default: () => 'NOW()' })
  closedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
