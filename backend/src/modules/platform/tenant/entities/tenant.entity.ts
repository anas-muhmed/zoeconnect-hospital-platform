import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Task 1.1).
 *
 * Represents one hospital/customer. `id` is a generated UUID — application
 * code should reference tenants by UUID internally; `code` is the
 * human-readable, stable identifier (e.g. 'default', 'apollo', 'aster').
 *
 * The single seeded row (`code: 'default'`) is what every existing
 * self-hosted install resolves to today via `TenantContextService` — this
 * table's existence changes nothing observable until later phases (Task 1.5+)
 * start actually branching on tenant identity.
 */
@Entity('tenant')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable, human-readable identifier. 'default' for the single self-hosted tenant. */
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subdomain: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  /**
   * Subdomain Release Lifecycle -- deprovisioning (status -> 'inactive')
   * does NOT free up `subdomain` for reuse by a different tenant on its
   * own: this column stays NULL for every tenant, past or present, whose
   * subdomain is still considered "claimed" (including deprovisioned-but-
   * not-yet-released ones), and only gets stamped by an explicit,
   * separate admin action (`TenantProvisioningService.releaseSubdomain()`).
   * The partial unique index on `subdomain` (added alongside this column,
   * see 1785100000000-TenantSubdomainReleaseLifecycle.ts) only enforces
   * uniqueness among rows where this is NULL -- a released row keeps its
   * `subdomain` value (and every bit of its history) forever, it just no
   * longer blocks a new tenant from claiming that same subdomain string.
   * Deliberately irreversible once set (no "un-release" path), matching
   * this table's existing "deprovision is terminal" posture.
   */
  @Column({ name: 'subdomain_released_at', type: 'timestamptz', nullable: true })
  subdomainReleasedAt: Date | null;

  /**
   * True for platform-owned tenants (currently just 'default') as opposed
   * to customer-provisioned tenants (Phase 10, Tenant Provisioning).
   */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
