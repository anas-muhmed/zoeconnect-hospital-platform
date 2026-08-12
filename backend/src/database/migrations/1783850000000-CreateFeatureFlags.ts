import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 11 ("Feature Flags", Task 11.1 / spec Section 8.2).
 *
 * A `FeatureFlag` row gates *behavior within an already-licensed module*
 * ('cms.emergency-broadcast', 'ai-assistant', etc) — a layer distinct from
 * and beneath `SubscriptionLicense.licensedModules`'s coarse per-module
 * boolean. Unlike the licensing/provisioning tables, `tenant_id` here is
 * genuinely nullable-and-meaningful, not a backfilled-but-unused artifact:
 * a NULL `tenant_id` row is a platform-wide default for that
 * `feature_key`, and a real `tenant_id` row overrides it for one tenant
 * specifically (`FeatureFlagService.isEnabled()` checks the tenant-specific
 * row first, falls back to the NULL/global row, then to "disabled" if
 * neither exists). `UQ_feature_flags_tenant_feature` is a composite unique
 * constraint on `(tenant_id, feature_key)` -- deliberately NOT the same
 * global-unique-on-name pattern `Role`/`Permission` use (see
 * PHASE_10_IMPLEMENTATION_PLAN.md's discrepancy #2), because per-tenant
 * variation is the entire point of this table, unlike those two.
 */
export class CreateFeatureFlags1783850000000 implements MigrationInterface {
  name = 'CreateFeatureFlags1783850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"           UUID,
        "feature_key"         VARCHAR(150) NOT NULL,
        "state"               VARCHAR(20) NOT NULL DEFAULT 'disabled',
        "rollout_percentage"  INT,
        "description"         VARCHAR(500),
        "updated_by"          VARCHAR(255),
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feature_flags" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_feature_flags_state" CHECK ("state" IN ('enabled', 'disabled', 'beta')),
        CONSTRAINT "CHK_feature_flags_rollout_percentage"
          CHECK ("rollout_percentage" IS NULL OR ("rollout_percentage" >= 0 AND "rollout_percentage" <= 100))
      );

      -- Composite unique index rather than a table constraint: Postgres
      -- unique constraints treat NULL as distinct-from-every-other-NULL,
      -- which is exactly the semantics wanted here (many global rows, one
      -- per feature_key, coexisting with many tenant-specific rows).
      CREATE UNIQUE INDEX "UQ_feature_flags_tenant_feature" ON "feature_flags" ("tenant_id", "feature_key");
      CREATE INDEX "IDX_feature_flags_feature_key" ON "feature_flags" ("feature_key");

      -- Task 11.3 pilot migration: CMS emergency-broadcast (activate/deactivate)
      -- has been an unconditional, always-on capability of the CMS module
      -- since Phase 1 -- there was no prior on/off switch at all. Wiring it
      -- to @RequireFeature('cms.emergency-broadcast') without seeding this
      -- row would make FeatureFlagService.isEnabled() default to 'disabled'
      -- (an unconfigured flag is off by design, see FeatureFlagsService's
      -- doc comment) and silently break emergency broadcasting for every
      -- existing tenant the moment this migration runs. Seeding a
      -- platform-wide (tenant_id NULL) 'enabled' row here preserves exactly
      -- today's behavior -- this migration is additive to the schema AND
      -- behavior-neutral, not just schema-neutral.
      INSERT INTO "feature_flags" ("tenant_id", "feature_key", "state", "description", "updated_by")
      VALUES (NULL, 'cms.emergency-broadcast', 'enabled', 'CMS emergency broadcast activate/deactivate -- always-on prior to Phase 11, preserved as enabled-by-default here.', 'system:migration-1783850000000');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "feature_flags";
    `);
  }
}
