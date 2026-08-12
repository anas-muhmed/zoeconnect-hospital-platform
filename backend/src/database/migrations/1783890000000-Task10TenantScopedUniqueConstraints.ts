import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-Scoped User Identity, Task 10 (broader sweep of other global
 * `unique: true` columns).
 *
 * See TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md — Task 10.
 *
 * Of the six columns the plan flagged for this follow-on audit
 * (`CardCategory`, `DisplayPage.name`/`.slug`, `TokenKiosk.kioskSlug`,
 * `SystemSetting.settingKey`, `FeedbackQrCode.token`,
 * `HisSchemaConfig.configKey`), a dedicated pre-flight investigation
 * (this task's own research pass) found the six split three ways, not one:
 *
 *   - `FeedbackQrCode.token` — confirmed correctly global by design (a
 *     cryptographically random opaque lookup token; the plan's own cited
 *     counter-example). No action.
 *   - `CardCategory.code` and `DisplayPage.slug` — each entity's own
 *     Stage-B-era doc comment explicitly flags tenant-ownership as an
 *     *undecided* architectural question ("Whether card categories end up
 *     tenant-owned or remain shared/global config is an open architectural
 *     question, not decided by this column's presence" /
 *     "Ownership classification: Shared/Global today ... Whether it should
 *     ever become tenant-owned or remain permanently global is an open
 *     Stage B architectural question"). Reversing an explicitly-flagged
 *     open product decision unilaterally, the way this migration would if
 *     it touched them, is out of scope for a "not blocking, not urgent"
 *     follow-on sweep — left as-is, still open, not silently resolved.
 *   - `SystemSetting.settingKey` — its own entity comment plus a separate,
 *     explicit "DOCUMENTED REINTERPRETATION" note in
 *     `TenantProvisioningService` (`tenant-provisioning.service.ts`) already
 *     declare this table a deliberate platform-wide global singleton, with
 *     per-tenant rows explicitly deferred out of scope
 *     (`PHASE_10_DEFERRED_BACKLOG.md`). This is an *existing, already-made*
 *     decision, not an open question — respected here, not overridden.
 *   - `TokenKiosk.kioskSlug` and `HisSchemaConfig.configKey` — the two
 *     genuine gaps this migration fixes. Neither entity's doc comment
 *     hedges: `TokenKiosk`'s says "Stage B must derive tenant server-side
 *     from this kiosk's branchId" (a definitive statement, not a question),
 *     and its write path (`TokenKioskService.createKiosk()`) already stamps
 *     `tenantId` via `TenantContextStorage.currentTenantIdOrNull()`.
 *     `HisSchemaConfig`'s says plainly "stores per-hospital Oracle
 *     table/column name mappings" — the exact same shape of bug `username`
 *     was before Task 5, just not yet fixed at the schema level.
 *
 * What this does, in order (same template as Task 1 + Task 5's migrations):
 *   1. Backfill any existing NULL `tenant_id` row on either table to the
 *      seeded 'default' tenant (same data-hygiene precondition Task 1
 *      established for `users`/`roles` — a composite unique index does NOT
 *      catch duplicate NULLs, since Postgres treats every NULL as distinct).
 *   2. Post-backfill duplicate check across (tenant_id, kiosk_slug) and
 *      (tenant_id, config_key) — logically redundant today (the OLD
 *      constraints were already single-column globally unique), but kept as
 *      an executed safety net, matching every other uniqueness migration in
 *      this identity work.
 *   3. Drop the old single-column unique constraints/indexes
 *      (`uq_token_kiosks_slug` from `1751300000000-TokenArchitecturePhase1.ts`,
 *      `uq_his_schema_configs_key` from `1700000010000-CreateHisSchemaConfig.ts`).
 *   4. `ALTER COLUMN "tenant_id" SET NOT NULL` on both tables.
 *   5. Add the new composite unique constraints:
 *      `uq_token_kiosks_tenant_slug UNIQUE (tenant_id, kiosk_slug)`,
 *      `uq_his_schema_configs_tenant_key UNIQUE (tenant_id, config_key)`.
 *
 * Companion code changes shipped in this same pass (not part of this
 * migration file, but required for it to be safe): `TokenKiosk`/
 * `HisSchemaConfig` entity `tenantId` columns changed from `nullable: true`
 * to `nullable: false`; `TokenKioskService.createKiosk()` given a guard that
 * throws rather than silently inserting a NULL tenant_id on the rare
 * request that reaches it with no ambient tenant context
 * (`currentTenantIdOrNull()` can legitimately return null outside a
 * tenant-scoped request); `HisConfigService.applyWebhookUpdate()` given the
 * same `resolveTargetTenant()`-based tenant-fallback bridge Task 8 already
 * built for `applyHdspUsers()` in the same file/class, now reused here
 * rather than re-invented, and its upsert `conflictPaths` widened to
 * `['configKey', 'tenantId']`; `LicenseController.vendorWebhook()` threads
 * `dto.tenantId` into both `applyWebhookUpdate()` calls (`hisConfig` and
 * `dbCredentials`), not just `applyHdspUsers()` as Task 8 left it.
 */
export class Task10TenantScopedUniqueConstraints1783890000000 implements MigrationInterface {
  name = 'Task10TenantScopedUniqueConstraints1783890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ table: string; keyCol: string }> = [
      { table: 'token_kiosks', keyCol: 'kiosk_slug' },
      { table: 'his_schema_configs', keyCol: 'config_key' },
    ];

    // -- Step 1: backfill NULL tenant_id -> seeded 'default' tenant --------
    for (const { table } of tables) {
      const [{ count }] = await queryRunner.query(
        `SELECT COUNT(*) AS count FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      if (Number(count) > 0) {
        console.log(
          `[Task10TenantScopedUniqueConstraints] "${table}": backfilling ${count} row(s) with NULL tenant_id -> 'default' tenant`,
        );
      }

      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);

      const [{ remaining }] = await queryRunner.query(
        `SELECT COUNT(*) AS remaining FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      if (Number(remaining) > 0) {
        throw new Error(
          `[Task10TenantScopedUniqueConstraints] "${table}" still has ${remaining} row(s) with NULL tenant_id after ` +
          `backfill -- does the 'default' tenant exist (SELECT * FROM "tenant" WHERE "code" = 'default')? Aborting migration.`,
        );
      }
    }

    // -- Step 2: post-backfill duplicate check ------------------------------
    for (const { table, keyCol } of tables) {
      const duplicates = await queryRunner.query(`
        SELECT "tenant_id", "${keyCol}", COUNT(*) AS count
        FROM "${table}"
        GROUP BY "tenant_id", "${keyCol}"
        HAVING COUNT(*) > 1;
      `);
      if (duplicates.length > 0) {
        const describe = duplicates
          .map((r: Record<string, string>) => `(tenant_id=${r.tenant_id}, ${keyCol}=${r[keyCol]}, count=${r.count})`)
          .join('; ');
        throw new Error(
          `[Task10TenantScopedUniqueConstraints] Found duplicate rows in "${table}" that would violate the new ` +
          `composite unique constraint -- resolve manually before re-running this migration. ${describe}. ` +
          `See TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md, Task 10.`,
        );
      }
    }

    // -- Step 3: drop old single-column unique constraints ------------------
    await queryRunner.query(`ALTER TABLE "token_kiosks" DROP CONSTRAINT IF EXISTS "uq_token_kiosks_slug";`);
    await queryRunner.query(`ALTER TABLE "his_schema_configs" DROP CONSTRAINT IF EXISTS "uq_his_schema_configs_key";`);

    // -- Step 4: tenant_id NOT NULL ------------------------------------------
    await queryRunner.query(`ALTER TABLE "token_kiosks" ALTER COLUMN "tenant_id" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "his_schema_configs" ALTER COLUMN "tenant_id" SET NOT NULL;`);

    // -- Step 5: new composite unique constraints ----------------------------
    await queryRunner.query(`ALTER TABLE "token_kiosks" ADD CONSTRAINT "uq_token_kiosks_tenant_slug" UNIQUE ("tenant_id", "kiosk_slug");`);
    await queryRunner.query(`ALTER TABLE "his_schema_configs" ADD CONSTRAINT "uq_his_schema_configs_tenant_key" UNIQUE ("tenant_id", "config_key");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverses cleanly PROVIDED no data now depends on the composite
    // constraint's wider allowance (two tenants both using the same kiosk
    // slug or config key) -- if such rows exist, re-adding the old
    // single-column global unique constraints below will fail with a
    // standard Postgres constraint-violation error, which is the correct,
    // safe failure mode: this down() must not silently drop data or pick a
    // winner between two now-colliding rows. Same posture as Task 5's down().
    await queryRunner.query(`ALTER TABLE "his_schema_configs" DROP CONSTRAINT "uq_his_schema_configs_tenant_key";`);
    await queryRunner.query(`ALTER TABLE "token_kiosks" DROP CONSTRAINT "uq_token_kiosks_tenant_slug";`);

    await queryRunner.query(`ALTER TABLE "his_schema_configs" ALTER COLUMN "tenant_id" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "token_kiosks" ALTER COLUMN "tenant_id" DROP NOT NULL;`);

    await queryRunner.query(`ALTER TABLE "his_schema_configs" ADD CONSTRAINT "uq_his_schema_configs_key" UNIQUE ("config_key");`);
    await queryRunner.query(`ALTER TABLE "token_kiosks" ADD CONSTRAINT "uq_token_kiosks_slug" UNIQUE ("kiosk_slug");`);
  }
}
