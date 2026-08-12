import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Stores system-wide configuration settings synchronized from the Vendor Portal.
 * Part of Workstream 3: Enterprise Configuration Platform.
 */
@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Dot-notation key, e.g. "security.idleTimeoutMinutes". Fix (2026-07-20,
   * real incident): this used to carry `unique: true` here -- a GLOBAL,
   * cross-tenant constraint meaning only one row for a given key could
   * ever exist in the whole database, so one tenant's settings silently
   * applied to every other tenant (a mis-configured idle timeout on one
   * tenant was randomly logging out a completely different tenant's
   * users). Replaced by a per-tenant composite constraint
   * (`uq_system_settings_tenant_key` on (tenant_id, setting_key), see
   * PerTenantSystemSettings migration, 1785600000000) -- uniqueness is now
   * scoped to "this key, for this tenant."
   */
  @Column({ name: 'setting_key', type: 'varchar', length: 100 })
  settingKey: string;

  /** Stored as JSON string to support booleans, numbers, and strings natively */
  @Column({ name: 'setting_value', type: 'text' })
  settingValue: string;

  /**
   * Tenant Foundation (Phase 1, Checkpoint A2) — was nullable and unread by
   * any code. Fix (2026-07-20): now read and stamped by every
   * SettingsService method (see that class's doc comment) -- resolved via
   * explicit override or ambient TenantContextStorage, falling back to
   * null only when genuinely no tenant context is available anywhere
   * (should not happen for any real request going forward). Stays
   * nullable at the DB level defensively, matching every other Stage A/B
   * tenant_id column in this codebase, rather than a hard NOT NULL that
   * could break an edge case this fix didn't anticipate.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** Human-readable label (optional, mostly managed in Vendor Portal) */
  @Column({ name: 'label', type: 'varchar', length: 150, nullable: true })
  label: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
