import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 (additive-only).
 *
 * An "Organization Branch" is a lightweight, ZoeConnect-native branch record
 * used ONLY when Oracle HIS is not connected for a tenant. It is a
 * deliberately separate concept from the existing HIS-sourced `Branch`
 * (`src/modules/branch/branch.service.ts`, which queries Oracle's live
 * `orgstructure` table and falls back to the synthetic
 * `DEFAULT_BRANCH_ID = '2'` sentinel) -- this table is NOT a replacement for
 * that flow and must never be conflated with it. When Oracle HIS is
 * connected for a tenant, the existing HIS Branch flow keeps working exactly
 * as it does today, untouched by this table's existence.
 *
 * "Organization" here means the existing `Tenant` row conceptually --
 * per explicit project-owner instruction, this phase does NOT rename
 * `Tenant`/`tenant_id` to `Organization`/`organization_id` anywhere, and does
 * NOT introduce a separate "Organization" table. `tenant_id` below is the
 * real, existing `tenant.id` foreign key.
 *
 * See migration 1788400000000-CreateOrganizationBranches.ts for the table
 * DDL (unique (tenant_id, code), partial unique index enforcing at most one
 * is_default=true row per tenant) and the one-row-per-tenant backfill.
 */
@Entity('organization_branches')
export class OrganizationBranch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Stable, tenant-scoped identifier (e.g. 'main', 'west-wing'). Unique per (tenant_id, code). */
  @Column({ type: 'varchar', length: 100 })
  code: string;

  /** At most one is_default=true row per tenant_id -- enforced by a partial unique index, not just app logic. */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
