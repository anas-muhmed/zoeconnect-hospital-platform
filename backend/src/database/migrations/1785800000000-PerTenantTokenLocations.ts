import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-tenant Token Queue locations (2026-07-20, real incident).
 *
 * Root cause (same two-part shape as 1785500000000-PerTenantTokenConfigConstraints.ts):
 *
 *   1. `token_locations.code` carried a GLOBAL `UNIQUE(code)` constraint
 *      (`uq_token_locations_code`, from 1700000015000-AddTokenLocations.ts,
 *      long before tenant_id existed). 1783810000000-AddTenantIdToTokenTables.ts
 *      later added a nullable `tenant_id` column and backfilled every
 *      pre-existing row (just the seeded 'GENERAL_BILLING' location at the
 *      time) to the single 'default' tenant, but never revisited this
 *      constraint to become per-tenant.
 *
 *   2. `TokenService.getLocations()` never filtered its read query by
 *      tenant_id at all (fixed in this same commit, token.service.ts) --
 *      so even tenant-stamped rows (e.g. a location an admin created after
 *      tenant stamping existed) were visible to every other tenant too.
 *
 * Observed symptom: two separate cloud tenants (mosc, almas) both saw the
 * identical "General Billing" / "Billing Counter" locations in the
 * authenticated "Join a Billing Counter" panel.
 *
 * This migration:
 *   a) Drops the global `uq_token_locations_code` constraint and replaces it
 *      with a `COALESCE(tenant_id, sentinel)`-based per-tenant unique index
 *      (write path is find-then-save in TokenService.createLocation(), not
 *      an ON CONFLICT upsert, so a COALESCE partial-equivalent index is the
 *      right shape here -- same reasoning as the licensing/token-config
 *      migrations earlier this session).
 *   b) Backfills: for every real, non-'default' tenant that currently has
 *      ZERO token_locations rows of its own, clones the original seeded
 *      'GENERAL_BILLING' row (from the 'default' tenant) as that tenant's
 *      own private row -- so a tenant that was only ever seeing the shared
 *      'default' row (or another tenant's rows, via the missing read
 *      filter) doesn't lose the ability to operate Token Queue the moment
 *      the read-side filter goes live. Tenants that already have their own
 *      real rows (correctly tenant-stamped, e.g. via createLocation() after
 *      the TokenController interceptor fix) are left completely untouched.
 */
export class PerTenantTokenLocations1785800000000 implements MigrationInterface {
  name = 'PerTenantTokenLocations1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── (a) Global -> per-tenant unique constraint on code MUST happen
    // first: the backfill below (b) inserts multiple rows all sharing
    // code='GENERAL_BILLING' (one clone per tenant), which the OLD global
    // UNIQUE(code) constraint rejects the moment a second row is inserted.
    // Real incident, 2026-07-20: this migration originally ran the backfill
    // first and failed immediately with `duplicate key value violates
    // unique constraint "uq_token_locations_code"` on the very first
    // cloned row. Constraint swap must come before any multi-tenant clone
    // insert, not after. ──────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "token_locations" DROP CONSTRAINT IF EXISTS "uq_token_locations_code";`);

    // Defensive de-duplication, same pattern as the earlier per-tenant
    // migrations this session: a no-op today (nothing has been cloned yet),
    // but guards against any other latent duplicate under the same
    // COALESCE(tenant_id, sentinel) before the new unique index is created.
    await queryRunner.query(`
      DELETE FROM "token_locations" a
      USING "token_locations" b
      WHERE a.ctid < b.ctid
        AND a."code" = b."code"
        AND COALESCE(a."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(b."tenant_id", '00000000-0000-0000-0000-000000000000'::uuid);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_locations_code_per_tenant"
      ON "token_locations" (("code"), (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)));
    `);

    // ── (b) Backfill: now safe, since uniqueness is scoped per-tenant ─────
    await queryRunner.query(`
      INSERT INTO "token_locations" ("code", "label", "is_active", "display_order", "branch_id", "token_prefix", "tenant_id")
      SELECT src."code", src."label", src."is_active", src."display_order", src."branch_id", src."token_prefix", t."id"
      FROM "token_locations" src
      CROSS JOIN "tenant" t
      WHERE src."code" = 'GENERAL_BILLING'
        AND t."code" != 'default'
        AND t."status" = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM "token_locations" existing WHERE existing."tenant_id" = t."id"
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_token_locations_code_per_tenant";`);
    await queryRunner.query(`ALTER TABLE "token_locations" ADD CONSTRAINT "uq_token_locations_code" UNIQUE ("code");`);
    // Backfilled per-tenant clones are deliberately NOT removed on down() --
    // by the time anyone rolls this back, tenants may already depend on
    // those rows for real Token Queue operation; removing them would be a
    // more destructive surprise than leaving harmless extra rows behind.
  }
}
