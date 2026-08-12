import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { IncidentInvestigation } from './incident-investigation.entity';

/**
 * IncidentInvestigationStatement — witness or staff statement attached to an
 * investigation. statementType: 'WITNESS' | 'STAFF_INVOLVED' | 'EXPERT'.
 */
@Entity('incident_investigation_statements')
@Index(['investigationId'])
export class IncidentInvestigationStatement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'investigation_id', type: 'uuid' })
  investigationId: string;

  @ManyToOne(() => IncidentInvestigation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'investigation_id' })
  investigation: IncidentInvestigation;

  @Column({ name: 'statement_type', type: 'varchar', length: 20, default: 'WITNESS' })
  statementType: string;

  @Column({ name: 'person_name', type: 'varchar', length: 255 })
  personName: string;

  @Column({ name: 'person_role', type: 'varchar', length: 100, nullable: true })
  personRole: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'statement_text', type: 'text' })
  statementText: string;

  @Column({ name: 'statement_date', type: 'timestamptz', default: () => 'NOW()' })
  statementDate: Date;

  @Column({ name: 'recorded_by_id', type: 'uuid' })
  recordedById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
