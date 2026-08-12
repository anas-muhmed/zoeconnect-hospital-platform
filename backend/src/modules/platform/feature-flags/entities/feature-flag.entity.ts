import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type FeatureFlagState = 'enabled' | 'disabled' | 'beta';

/**
 * FeatureFlag (Phase 11, Task 11.1 / spec Section 8.2).
 *
 * Gates behavior *within* an already-licensed Business module — a layer
 * beneath `SubscriptionLicense.licensedModules`'s coarse per-module
 * boolean, not a replacement for it. `LicenseGuard`/`@RequireModule()`
 * remains the authority on "is this module licensed at all"; this table
 * only matters once that question is already 'yes'.
 *
 * `tenantId: null` is a genuine, meaningful platform-wide default for a
 * `featureKey` (not a backfilled-but-unused artifact like the nullable
 * `tenant_id` columns on Role/Permission/Settings found during Phase 10 —
 * see PHASE_10_IMPLEMENTATION_PLAN.md's discrepancy #2). A non-null
 * `tenantId` row overrides the global default for that one tenant.
 * `FeatureFlagService.isEnabled()` checks the tenant-specific row first,
 * then the global row, then defaults to disabled if neither exists.
 *
 * `rolloutPercentage` (spec Section 8.2's "optional rolloutPercentage for
 * gradual rollout") is stored but NOT evaluated by `isEnabled()` in this
 * phase's pilot — `state: 'beta'` alone is sufficient for the one pilot
 * migration (Task 11.3). Percentage-based gradual rollout needs a stable
 * per-tenant hash bucketing decision (which tenant identifier, which hash
 * function) that has no real use case to validate against yet with a
 * single pilot feature — tracked as a natural follow-up once a second
 * feature flag actually needs it, not built speculatively here.
 */
@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = platform-wide default for this featureKey. Non-null = per-tenant override. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** Dot-namespaced by convention, e.g. 'cms.emergency-broadcast', 'ai-assistant'. */
  @Column({ name: 'feature_key', type: 'varchar', length: 150 })
  featureKey: string;

  @Column({ type: 'varchar', length: 20, default: 'disabled' })
  state: FeatureFlagState;

  @Column({ name: 'rollout_percentage', type: 'int', nullable: true })
  rolloutPercentage: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** Username/identifier of the admin who last changed this row — audit trail only. */
  @Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
