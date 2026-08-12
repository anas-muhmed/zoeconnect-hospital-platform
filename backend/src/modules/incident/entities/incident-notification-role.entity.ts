import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * IncidentNotificationRole — an incident-module-scoped notification target
 * (e.g. "RISK_MANAGER", "DEPARTMENT_HEAD"), distinct from platform RBAC
 * roles. Severity levels and notification rules reference these by `name`
 * in their `notifyRoles` jsonb arrays; the members mapped here (via
 * `incident_notification_role_members`) are who actually receives the
 * notification when that name is targeted.
 *
 * Deliberately NOT the same thing as `rbac.roles` — those grant login
 * permissions and are managed platform-wide under Users → Roles. These are
 * a lightweight escalation/notification routing list that lives entirely
 * inside Incident Settings, so incident admins can manage "who is the risk
 * manager right now" without touching platform RBAC.
 */
@Entity('incident_notification_roles')
@Index(['tenantId', 'isActive'])
export class IncidentNotificationRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
