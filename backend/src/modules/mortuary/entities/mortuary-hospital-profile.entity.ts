import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A).
 *
 * A "hospital" in the original zoe-platform Mortuary module maps directly
 * onto an existing ZoeConnect `Tenant` (one hospital = one tenant — see
 * Tenant's own doc comment). This entity holds ONLY the Mortuary-specific
 * display/onboarding fields the old `hospitals` table had that `Tenant`
 * does not (`name`/active-status are already covered by `Tenant.name` /
 * `Tenant.status` and are deliberately NOT duplicated here).
 *
 * `clientId` preserves a real business rule: it is the prefix used by
 * `generateBodyNumber()` (e.g. "SUNH8261-2026-0001") and the value staff
 * self-registration matches against — both behaviors are ported unchanged
 * in Stage C, this column just carries the data forward.
 *
 * Hospital/tenant CREATION is intentionally NOT part of the Mortuary
 * module — that's ZoeConnect's existing TenantProvisioningModule's job
 * (see Stage A report). This table is populated once a Tenant already
 * exists, not the other way around.
 */
@Entity('mortuary_hospital_profiles')
export class MortuaryHospitalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  /**
   * Prefix used for body-number generation and staff self-registration
   * matching. Unique across all tenants (was globally unique in the
   * source schema). Nullable: the source's own `hospitals.client_id`
   * ALTER never added NOT NULL, and `generateBodyNumber()` has an
   * explicit `|| 'HOSP'` fallback for exactly this case — preserved,
   * not tightened.
   */
  @Column({ name: 'client_id', type: 'varchar', length: 50, unique: true, nullable: true })
  clientId: string | null;

  /** Object-repository storage key (Stage E), not a raw URL — replaces the old `hospitals.logo` TEXT column. */
  @Column({ name: 'logo_object_key', type: 'text', nullable: true })
  logoObjectKey: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 150, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
