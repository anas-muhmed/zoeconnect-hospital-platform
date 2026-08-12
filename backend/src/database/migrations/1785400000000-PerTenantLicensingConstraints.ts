import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-Tenant Licensing Constraints (Licensing Module Tenant-Scoping
 * Migration, Phase 5 of 6).
 *
 * Problem this fixes: two invariants in this schema are currently enforced
 * (or only checked) globally, which is correct for a single-tenant
 * self-hosted install but wrong the moment a shared cloud backend serves
 * more than one tenant:
 *
 * 1. `uq_vendor_registrations_single_active` (added by
 *    VendorRegistrationSingletonEnforcement1785200000000, part of the
 *    earlier production-hardening pass) is a partial unique index on a
 *    constant expression scoped only to `status = 'ACTIVE'` -- "at most
 *    one ACTIVE row in the whole table, period." Once a second tenant's
 *    VendorRegistration row exists, this constraint would block tenant #2
 *    from ever registering (the DB would reject the second row outright)
 *    -- an outage-by-migration for a currently-nonexistent-but-planned
 *    scenario, not a corner case.
 *
 * 2. `submitRequest()`'s "already-pending?" check (vendor-sync.service.ts)
 *    was, until Phase 3 of this same plan, a global
 *    `reqRepo.findOne({ where: { status: 'PENDING' } })` -- checked at the
 *    application layer only, no DB constraint backing it at all. Phase 3
 *    switched that check to the tenant-scoped repository, but nothing
 *    stops a race between two concurrent submitRequest() calls for the
 *    SAME tenant from both passing the check before either commits
 *    (the exact class of race VendorRegistrationSingletonEnforcement's own
 *    doc comment already describes for registrations).
 *
 * Fix:
 *  - Replace the global partial unique index with one scoped by
 *    `tenant_id` -- "at most one ACTIVE row per tenant" instead of
 *    "at most one ACTIVE row total." For self-hosted (exactly one tenant,
 *    every existing row backfilled to it by
 *    BackfillLicensingTenantId1785300000000), this enforces the *exact
 *    same thing* the old global index did -- one tenant, so "per tenant"
 *    and "total" are identical in practice. For cloud, this is what
 *    actually lets tenant #2+ register at all.
 *  - Add the equivalent partial unique index on `license_requests`,
 *    scoped by `tenant_id` and `status = 'PENDING'` -- closes the
 *    concurrent-submitRequest() race at the DB level, the same way
 *    VendorRegistrationSingletonEnforcement closed internalProvision()'s
 *    race. This is a NEW constraint (no prior global version existed to
 *    replace), so for self-hosted it simply starts enforcing "at most one
 *    pending request" at the DB level instead of only at the application
 *    layer -- self-hosted's real-world usage pattern (one admin, one
 *    pending request at a time) already satisfies this; no manual data
 *    cleanup should be necessary in practice, but see `up()`'s defensive
 *    de-duplication below in case it isn't.
 *
 * SELF-REVIEW FIX (finding 4): the per-tenant index below is built on
 * `COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)`
 * rather than the raw `tenant_id` column. Postgres unique indexes treat
 * every NULL as distinct from every other NULL, so a plain
 * `("tenant_id")` index gives ZERO duplicate-registration protection to
 * rows with `tenant_id IS NULL` -- exactly what the still-untouched
 * `internal-provision` endpoint writes. Coalescing to a fixed sentinel
 * UUID makes every NULL-tenant row collide with every other NULL-tenant
 * row for uniqueness purposes (restoring the "at most one" invariant for
 * that path, matching what the OLD global index already enforced for it)
 * while remaining a no-op for every real, non-null tenant_id -- a
 * randomly-generated tenant UUID will never equal the all-zeros sentinel.
 * The de-duplication steps below use the identical COALESCE expression so
 * `DISTINCT ON` groups rows exactly the same way the index they precede
 * will enforce.
 *
 * ROLLBACK NOTES:
 *  - Rolling back restores the OLD global
 *    `uq_vendor_registrations_single_active` index verbatim (not just
 *    drops the new one) -- if this migration needs to be reverted, the
 *    prior invariant it replaced comes back exactly as it was, rather
 *    than leaving the table with no active-registration constraint at
 *    all.
 *  - Rolling back the new `license_requests` pending-request index simply
 *    drops it -- there was no prior constraint to restore (Phase 3's
 *    application-layer check is unaffected by this migration's down()
 *    either way).
 *  - Neither direction of this migration deletes or alters any row data
 *    beyond the identical, non-destructive de-duplication `up()` performs
 *    if (and only if) pre-existing duplicate rows are found -- see below.
 */
export class PerTenantLicensingConstraints1785400000000 implements MigrationInterface {
  name = 'PerTenantLicensingConstraints1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. vendor_registrations: global -> per-tenant singleton ───────────
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_registrations_single_active"`);

    // Defensive: de-duplicate any pre-existing per-tenant duplicates before
    // creating the new index (mirrors VendorRegistrationSingletonEnforcement's
    // own de-duplication step). In practice this table has at most one row
    // total today (the global index this replaces already enforced that),
    // so this is a no-op on any database that hasn't already had the old
    // constraint bypassed some other way (e.g. a direct INSERT during a
    // maintenance window).
    await queryRunner.query(`
      UPDATE "vendor_registrations" SET "status" = 'SUSPENDED'
      WHERE "status" = 'ACTIVE' AND "id" NOT IN (
        SELECT DISTINCT ON (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)) "id" FROM "vendor_registrations"
        WHERE "status" = 'ACTIVE'
        ORDER BY COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "registered_at" DESC
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_registrations_single_active_per_tenant"
      ON "vendor_registrations" (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE "status" = 'ACTIVE';
    `);

    // ── 2. license_requests: new per-tenant "one pending" constraint ──────
    await queryRunner.query(`
      UPDATE "license_requests" SET "status" = 'REJECTED', "rejection_reason" = COALESCE("rejection_reason", 'Superseded by a later pending request (per-tenant constraint backfill)')
      WHERE "status" = 'PENDING' AND "id" NOT IN (
        SELECT DISTINCT ON (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid)) "id" FROM "license_requests"
        WHERE "status" = 'PENDING'
        ORDER BY COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "submitted_at" DESC
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_license_requests_single_pending_per_tenant"
      ON "license_requests" (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE "status" = 'PENDING';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_license_requests_single_pending_per_tenant"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_vendor_registrations_single_active_per_tenant"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vendor_registrations_single_active"
      ON "vendor_registrations" ((true))
      WHERE "status" = 'ACTIVE';
    `);
  }
}
