import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * IncidentNotificationRule — fully configurable notification routing.
 *
 * conditions: JSON array of rule conditions, e.g.:
 *   [{ "field": "severity_code", "op": "eq", "value": "CRITICAL" },
 *    { "field": "category_code", "op": "eq", "value": "MEDICATION" }]
 *
 * notifyRoles: JSON array of role names to notify when all conditions match.
 * notifyUserIds: JSON array of specific user UUIDs to always notify.
 *
 * triggerEvent: one of:
 *   INCIDENT_CREATED | INCIDENT_SUBMITTED | INCIDENT_ACKNOWLEDGED |
 *   INCIDENT_ASSIGNED | TRIAGE_COMPLETED | INVESTIGATION_STARTED |
 *   RCA_COMPLETED | CAPA_CREATED | CAPA_DUE_TOMORROW | CAPA_OVERDUE |
 *   VERIFICATION_REJECTED | INCIDENT_CLOSED
 */
@Entity('incident_notification_rules')
@Index(['tenantId', 'isActive', 'triggerEvent'])
export class IncidentNotificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'trigger_event', type: 'varchar', length: 50 })
  triggerEvent: string;

  @Column({ type: 'jsonb', default: '[]' })
  conditions: Array<{ field: string; op: string; value: unknown }>;

  @Column({ name: 'notify_roles', type: 'jsonb', default: '[]' })
  notifyRoles: string[];

  @Column({ name: 'notify_user_ids', type: 'jsonb', default: '[]' })
  notifyUserIds: string[];

  @Column({ type: 'varchar', length: 20, default: 'PUSH' })
  channel: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
