import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-Tenant System Settings.
 *
 * Real production incident (2026-07-20): MOSC's users were being randomly
 * logged out. Root cause traced to `SettingsService.getSettings()`
 * (settings.service.ts), which read `system_settings` with NO tenant
 * filter at all -- and `setting_key` (`system-setting.entity.ts`) carried
 * a GLOBAL `UNIQUE` constraint (`UQ_9037e7dec102dfdfb0c5343807f`, from
 * CreateSystemSettings 1783405488684, which predates any tenant concept
 * entirely). That means there could only ever be ONE row for
 * `"security.idleTimeoutMinutes"` in the whole database, shared by every
 * tenant -- so any other tenant configuring a short idle timeout for
 * their own testing silently applied it to MOSC's sessions too, with no
 * way for MOSC's own admin to see or control it. `tenant_id` already
 * existed on this entity (added at Tenant Foundation Checkpoint A2) but
 * was, per its own doc comment, "unread by any code yet."
 *
 * Fix: make `system_settings` genuinely per-tenant.
 *  - Drop the global unique constraint on `setting_key` alone.
 *  - Backfill every existing row (self-hosted's real settings, and any
 *    pre-existing cloud rows) to the seeded 'default' tenant -- for
 *    self-hosted (the only tenant that will ever exist there), this is
 *    byte-identical to today's behavior. Any pre-existing cloud rows
 *    become "default"-tenant-owned rather than silently global; if that's
 *    wrong for a specific key, it can be corrected via the Settings UI
 *    per-tenant going forward.
 *  - Add a plain composite `UNIQUE (tenant_id, setting_key)` constraint
 *    (NOT a COALESCE-based partial index like the licensing/token-config
 *    fixes earlier today) -- deliberately simpler here because
 *    `SettingsService.applyWebhookUpdate()` uses TypeORM's high-level
 *    `.upsert()`, which generates a plain `ON CONFLICT (col1, col2)`
 *    target that must exactly match a real (non-expression) unique
 *    index/constraint. A composite `UNIQUE(tenant_id, setting_key)`
 *    constraint satisfies that directly; an expression-based
 *    `COALESCE(...)` index would not (same class of trap flagged and
 *    deliberately avoided for token_sequences/token_analytics_daily in
 *    the PerTenantTokenConfigConstraints migration). Every real write
 *    path now always resolves a real tenantId (ambient context or
 *    explicit override -- see SettingsService), so `tenant_id IS NULL`
 *    should not occur for any NEW row going forward; the column stays
 *    nullable defensively (matching every other Stage A/B tenant_id
 *    column in this codebase), accepting that Postgres's standard
 *    multi-column UNIQUE constraint (unlike a partial index) does not
 *    de-duplicate NULL-tenant rows against each other -- an acceptable,
 *    documented tradeoff for a table this small and low-traffic, not
 *    something `getSettings()`'s read path is sensitive to either (its
 *    `result[key] = value` aggregation loop is idempotent regardless of
 *    row count for a given key).
 */
export class PerTenantSystemSettings1785600000000 implements MigrationInterface {
  name = 'PerTenantSystemSettings1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "UQ_9037e7dec102dfdfb0c5343807f"`);

    await queryRunner.query(`
      UPDATE "system_settings"
      SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
      WHERE "tenant_id" IS NULL;
    `);

    // Defensive de-duplication in case more than one row for the same key
    // already exists (only possible if the old global constraint was
    // somehow bypassed) -- keep the most recently updated row per
    // (tenant_id, setting_key) pair.
    await queryRunner.query(`
      DELETE FROM "system_settings" a USING "system_settings" b
      WHERE a."id" <> b."id"
        AND a."setting_key" = b."setting_key"
        AND COALESCE(a."tenant_id"::text, '') = COALESCE(b."tenant_id"::text, '')
        AND (a."updated_at" < b."updated_at" OR (a."updated_at" = b."updated_at" AND a."id" < b."id"));
    `);

    await queryRunner.query(`
      ALTER TABLE "system_settings"
      ADD CONSTRAINT "uq_system_settings_tenant_key" UNIQUE ("tenant_id", "setting_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "uq_system_settings_tenant_key"`);
    await queryRunner.query(`
      ALTER TABLE "system_settings"
      ADD CONSTRAINT "UQ_9037e7dec102dfdfb0c5343807f" UNIQUE ("setting_key")
    `);
  }
}
