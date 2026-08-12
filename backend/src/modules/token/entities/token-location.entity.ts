import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { TokenCounter } from './token-counter.entity';

@Entity('token_locations')
export class TokenLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Machine-friendly code - auto-generated from label, e.g. PHARMACY_BILLING */
  @Column({ length: 60, unique: true })
  code: string;

  /** Human label shown in UI and on TV display, e.g. "Pharmacy Billing" */
  @Column({ length: 100 })
  label: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Branch this location belongs to (Oracle orgstructure.id). Defaults to '2' (ALMAS). */
  @Column({ name: 'branch_id', type: 'varchar', length: 30, nullable: true, default: '2' })
  branchId: string | null;

  /** HIS intrabranchid - same as the Oracle orgstructure id used for branch filtering */
  @Column({ name: 'intrabranchid', type: 'varchar', length: 30, nullable: true })
  intrabranchId: string | null;

  /** HIS department FK (Oracle hisdepartment.department_id) */
  @Column({ name: 'department_id', type: 'varchar', length: 30, nullable: true })
  departmentId: string | null;

  /** HIS department name (cached for receipt printing) */
  @Column({ name: 'department_name', type: 'varchar', length: 255, nullable: true })
  departmentName: string | null;

  /** HIS service center FK (Oracle servicecenter.service_center_id) */
  @Column({ name: 'service_center_id', type: 'varchar', length: 30, nullable: true })
  serviceCenterId: string | null;

  /** HIS service center name (cached for receipt printing) */
  @Column({ name: 'service_center_name', type: 'varchar', length: 255, nullable: true })
  serviceCenterName: string | null;

  /**
   * Token prefix for this location (e.g. "G" -> tokens display as "G-001").
   * Empty string means no prefix - token displays as plain number "001".
   * Added by GAP-4 migration.
   */
  @Column({ name: 'token_prefix', length: 10, default: '' })
  tokenPrefix: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A13) — nullable, unread by any
   * code yet. No relation/FK yet (deferred to Stage B); kept here purely
   * so the entity stays in sync with the database schema.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /**
   * Globally-unique token for the public TV display board's URL
   * (`/token/display?token=<this>`), independent of `code` (which is only
   * unique per-tenant, see 1785800000000-PerTenantTokenLocations.ts). Looked
   * up with a raw, non-tenant-scoped query — see
   * TokenService.getPublicLocationByDisplayToken() — so the display board
   * never needs hostname-based tenant resolution (which cloud tenants,
   * having no per-tenant subdomain, can't reliably provide). See
   * 1789100000000-AddDisplayTokenToTokenLocations.ts.
   */
  @Column({ name: 'display_token', type: 'varchar', length: 32, nullable: true })
  displayToken: string | null;

  @OneToMany(() => TokenCounter, (counter) => counter.location, { cascade: true })
  counters: TokenCounter[];
}
