import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * HisSchemaConfig — stores per-hospital Oracle table/column name mappings.
 *
 * Populated by the vendor portal via the HIS_CONFIG_UPDATE webhook event.
 * Seeded with defaults by migration 010 so queries work out-of-the-box
 * with the placeholder names until the vendor admin configures real ones.
 *
 * config_key examples:
 *   "patient.table"        → "PAT_MASTER"   (or hospital's real table name)
 *   "billing.col.billId"   → "BILL_NO"
 *   "billing.status.finalised" → "FINALISED"
 */
@Entity('his_schema_configs')
@Index('uq_his_schema_configs_tenant_key', ['tenantId', 'configKey'], { unique: true })
export class HisSchemaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Internal dot-notation key — e.g. "billing.table", "patient.col.mrn" */
  @Column({ name: 'config_key', type: 'varchar', length: 120 })
  configKey: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A3) — originally nullable and
   * unread. Tenant-Scoped User Identity, Task 8: `HisConfigService
   * .applyHdspUsers()` started stamping this via `resolveTargetTenant()`.
   * Task 10: `applyWebhookUpdate()` (this table's other, older write path)
   * now uses the same helper, `configKey`'s unique constraint was widened
   * to a composite `(tenantId, configKey)`, and this column is `NOT NULL`
   * — see `1783890000000-Task10TenantScopedUniqueConstraints.ts`. This was
   * a genuine tenant-scoped-identity gap: the class-level doc comment above
   * already describes "per-hospital" mappings, the same shape of bug
   * `username` was before Task 5.
   */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Resolved Oracle identifier or raw SQL query string */
  @Column({ name: 'config_value', type: 'text' })
  configValue: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
