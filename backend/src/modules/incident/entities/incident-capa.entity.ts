import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn, VersionColumn
} from 'typeorm';
import { Incident } from './incident.entity';
import { IncidentRca } from './incident-rca.entity';

/**
 * IncidentCapa — Corrective and Preventive Action.
 *
 * capaType: 'CORRECTIVE' | 'PREVENTIVE'
 * status:   'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'REOPENED'
 *
 * isOverdue: set by IncidentSlaService's daily @Cron — prevents hot-path
 *   DB queries from recalculating this for every dashboard render.
 *
 * ownerName: captured at create time as a snapshot because the owner
 *   may be a non-ZoeConnect employee (from Oracle HIS or manual entry).
 */
@Entity('incident_capa')
@Index(['incidentId', 'status'])
@Index(['tenantId', 'ownerId', 'status'])
@Index(['tenantId', 'dueDate', 'status'])
export class IncidentCapa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'rca_id', type: 'uuid', nullable: true })
  rcaId: string | null;

  @ManyToOne(() => IncidentRca, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rca_id' })
  rca: IncidentRca | null;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'capa_type', type: 'varchar', length: 20, default: 'CORRECTIVE' })
  capaType: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'owner_name', type: 'varchar', length: 255, nullable: true })
  ownerName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'priority_code', type: 'varchar', length: 20, default: 'MEDIUM' })
  priorityCode: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'completion_notes', type: 'text', nullable: true })
  completionNotes: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'is_overdue', default: false })
  isOverdue: boolean;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
