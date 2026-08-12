import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique,
} from 'typeorm';

@Entity('permissions')
@Unique(['moduleCode', 'resource', 'action'])
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_code', length: 50 })
  moduleCode: string;

  @Column({ length: 100 })
  resource: string;

  @Column({ length: 50 })
  action: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A4) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Computed permission string used throughout RBAC checks: MODULE:RESOURCE:ACTION */
  get key(): string {
    return `${this.moduleCode}:${this.resource}:${this.action}`;
  }
}
