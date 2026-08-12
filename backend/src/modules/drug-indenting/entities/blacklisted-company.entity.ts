import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Drug Indenting integration. Ports `blacklisted_companies`.
 *
 * Tenant-scoped (not global) — decision, flagged for confirmation: unlike
 * Mortuary's `body_types` (verified via migration diff to be genuinely
 * global reference data with no per-hospital variant ever), Drug
 * Indenting's source never had multi-tenant scoping at all, so there is
 * no equivalent evidence either way. A blacklisted pharma company could
 * plausibly be a real-world fact independent of which hospital is asking,
 * or plausibly hospital-specific (one hospital's bad experience isn't
 * necessarily every hospital's). Defaulting to tenant-scoped (the safer,
 * more conservative choice, consistent with Mortuary's D1 "every business
 * table gets tenant_id unless proven global" rule) rather than assuming
 * it should be shared platform-wide.
 */
@Entity('drug_blacklisted_companies')
export class BlacklistedCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 300 })
  companyName: string;

  @Column({ name: 'company_type', type: 'varchar', length: 50 })
  companyType: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  remarks: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'removed_by', type: 'uuid', nullable: true })
  removedBy: string | null;

  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt: Date | null;
}
