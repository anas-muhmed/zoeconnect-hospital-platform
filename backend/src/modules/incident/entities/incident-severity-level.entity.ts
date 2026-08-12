import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * IncidentSeverityLevel — fully configurable severity with embedded SLA hours.
 *
 * slaResponseHours, slaInvestigationHours, slaCapaDays, slaClosureDays
 * are the per-severity SLA targets used by IncidentSlaService to calculate
 * due timestamps when an incident is created or severity changes.
 *
 * notifyRoles is a JSON array of role names to notify immediately when
 * an incident at this severity is created (used by the notification rule engine).
 */
@Entity('incident_severity_levels')
@Index(['tenantId', 'isActive'])
export class IncidentSeverityLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 20, default: '#6B7280' })
  color: string;

  @Column({ name: 'sla_response_hours', type: 'int', nullable: true })
  slaResponseHours: number | null;

  @Column({ name: 'sla_investigation_hours', type: 'int', nullable: true })
  slaInvestigationHours: number | null;

  @Column({ name: 'sla_capa_days', type: 'int', nullable: true })
  slaCapaDays: number | null;

  @Column({ name: 'sla_closure_days', type: 'int', nullable: true })
  slaClosureDays: number | null;

  @Column({ name: 'notify_roles', type: 'jsonb', default: '[]' })
  notifyRoles: string[];

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
