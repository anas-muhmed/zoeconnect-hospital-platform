import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-Tenant Token Config Constraints.
 *
 * Real production incident (2026-07-20, MOSC cloud tenant): `GET
 * /token/config` 500'd with `duplicate key value violates unique
 * constraint "uq_token_branch_config_branch"` the first time a second
 * tenant's `TokenConfigService.getBranchConfig()` tried to auto-create a
 * config row for a `branch_id` that ANY other tenant (or the same tenant's
 * fallback DEFAULT_BRANCH_ID='2', used by every Oracle-less cloud tenant)
 * had already used.
 *
 * Root cause: `token_branch_config.branch_id` (and
 * `token_sc_configs (branch_id, service_center_id)`) were given a plain,
 * *global* UNIQUE constraint back in TokenArchitecturePhase1
 * (1751300000000) — correct for self-hosted, where the whole database
 * belongs to exactly one tenant, so "unique per branch" and "unique
 * globally" were the same thing. `AddTenantIdToTokenTables1783810000000`
 * later added a nullable `tenant_id` column to both tables (among 15
 * others) but never revisited these two pre-existing global uniqueness
 * constraints — so on a shared cloud database, tenant #2's very first
 * branch/service-center config write for a `branch_id` (or `branch_id` +
 * `service_center_id` pair) already used by tenant #1 collides at the DB
 * level. This will hit every cloud tenant after the first, not just MOSC,
 * particularly since DEFAULT_BRANCH_ID='2' is the fallback every
 * Oracle-less cloud tenant's SUPER_ADMIN resolves to.
 *
 * Fix: same pattern as PerTenantLicensingConstraints (1785400000000) —
 * replace the global unique constraint with one scoped by
 * `COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)`.
 * For self-hosted (exactly one tenant, every existing row already
 * backfilled to it), "per tenant" and "global" are identical in practice
 * — zero behavior change there. For cloud, this is what lets tenant #2+
 * actually create their own branch config / service-center config at all.
 *
 * Deliberately NOT touched here (same class of bug, but riskier / needs
 * more than a migration, left for separate follow-up):
 *   - `token_kiosks.kiosk_slug` (uq_token_kiosks_slug) — kiosk slugs are
 *     looked up from unauthenticated, tenant-context-free public kiosk
 *     URLs; making this per-tenant requires the read path to resolve
 *     tenant some other way FIRST (host/subdomain), not just a DB
 *     constraint change. Needs its own investigation.
 *   - `token_sequences` (uq_token_sequences_unique) and
 *     `token_analytics_daily` — both are written via
 *     `INSERT ... ON CONFLICT (<exact current unique columns>) DO UPDATE`
 *     (see token-sequence.service.ts, token-analytics.service.ts).
 *     Postgres requires an ON CONFLICT target to exactly match an
 *     existing unique index's column/expression list, so changing the
 *     underlying constraint here without ALSO updating those two
 *     services' raw SQL would break token issuance / analytics upserts
 *     for every tenant, self-hosted included — a strictly worse
 *     regression than the bug being fixed. Out of scope for a
 *     migration-only fix.
 *
 * Neither `token_branch_config.getBranchConfig()` nor
 * `token-config.service.ts`'s service-center equivalent uses `ON
 * CONFLICT` (both do a plain findOne()-then-save() get-or-create), so
 * this pair is safe to change without any application code changes.
 */
export class PerTenantTokenConfigConstraints1785500000000 implements MigrationInterface {
  name = 'PerTenantTokenConfigConstraints1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. token_branch_config: global -> per-tenant branch uniqueness ────
    await queryRunner.query(`ALTER TABLE "token_branch_config" DROP CONSTRAINT IF EXISTS "uq_token_branch_config_branch"`);

    // Defensive de-duplication (mirrors PerTenantLicensingConstraints):
    // in practice every existing row was backfilled to a single tenant
    // (self-hosted) or predates multi-tenant cloud entirely, so this is a
    // no-op unless the old global constraint was somehow already bypassed.
    await queryRunner.query(`
      DELETE FROM "token_branch_config" a USING "token_branch_config" b
      WHERE a."id" < b."id"
        AND COALESCE(a."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(b."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
        AND a."branch_id" = b."branch_id";
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_branch_config_branch_per_tenant"
      ON "token_branch_config" (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "branch_id");
    `);

    // ── 2. token_sc_configs: global -> per-tenant (branch, service center) ─
    await queryRunner.query(`ALTER TABLE "token_sc_configs" DROP CONSTRAINT IF EXISTS "uq_token_sc_configs_branch_sc"`);

    await queryRunner.query(`
      DELETE FROM "token_sc_configs" a USING "token_sc_configs" b
      WHERE a."id" < b."id"
        AND COALESCE(a."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(b."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
        AND a."branch_id" = b."branch_id"
        AND a."service_center_id" = b."service_center_id";
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_sc_configs_branch_sc_per_tenant"
      ON "token_sc_configs" (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "branch_id", "service_center_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_token_sc_configs_branch_sc_per_tenant"`);
    await queryRunner.query(`
      ALTER TABLE "token_sc_configs" ADD CONSTRAINT "uq_token_sc_configs_branch_sc" UNIQUE ("branch_id", "service_center_id")
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_token_branch_config_branch_per_tenant"`);
    await queryRunner.query(`
      ALTER TABLE "token_branch_config" ADD CONSTRAINT "uq_token_branch_config_branch" UNIQUE ("branch_id")
    `);
  }
}
