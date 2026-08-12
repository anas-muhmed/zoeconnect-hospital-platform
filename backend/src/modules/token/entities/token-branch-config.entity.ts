import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type TokenMode = 'SERVICE_CENTER_BASED' | 'LOCATION_BASED';

@Entity('token_branch_config')
export class TokenBranchConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Oracle orgstructure.id --- uniquely identifies the branch WITHIN a
   * tenant. Fix (2026-07-20): this used to carry `unique: true` here
   * (a global, cross-tenant DB constraint) -- replaced by a per-tenant
   * partial unique index (see PerTenantTokenConfigConstraints migration,
   * 1785500000000) since a shared cloud database now has more than one
   * tenant, and two tenants legitimately reusing the same branch_id
   * (e.g. both falling back to DEFAULT_BRANCH_ID) must not collide.
   */
  @Column({ name: 'branch_id', length: 30 })
  branchId: string;

  /**
   * LOCATION_BASED  --- Admin creates locations manually; no HIS Oracle dependency.
   * SERVICE_CENTER_BASED --- Service centers + departments pulled from HIS Oracle.
   */
  @Column({ length: 30, default: 'LOCATION_BASED' })
  mode: TokenMode;

  /** Time at which daily token sequences reset (HH:MM:SS, stored as TIME) */
  @Column({ name: 'daily_reset_time', type: 'time', default: '00:00:00' })
  dailyResetTime: string;

  /** IANA timezone identifier, e.g. "Asia/Kolkata" */
  @Column({ length: 60, default: 'Asia/Kolkata' })
  timezone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'varchar', name: 'updated_by', length: 100, nullable: true })
  updatedBy: string | null;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;
}
