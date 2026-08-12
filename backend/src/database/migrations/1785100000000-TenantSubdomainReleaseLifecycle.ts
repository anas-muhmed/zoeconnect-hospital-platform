import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subdomain Release Lifecycle.
 *
 * Problem this fixes: `UQ_tenant_subdomain` (added by
 * 1783840000000-CreateTenantProvisioning.ts) is a plain, unconditional
 * UNIQUE constraint on `tenant.subdomain`. Combined with `deprovision()`
 * being a one-way, data-preserving operation (flips `status` to
 * 'inactive', never deletes the row -- see that method's own doc
 * comment), this means a deprovisioned tenant's subdomain is blocked
 * *forever*: no new tenant can ever provision under that subdomain again,
 * even years later, even though nothing about deprovisioning was supposed
 * to be a permanent namespace reservation.
 *
 * Fix: replace the unconditional unique constraint with a partial one,
 * scoped to `subdomain_released_at IS NULL`. A tenant's subdomain stays
 * globally exclusive for as long as it's "claimed" -- which now includes
 * the entire deprovisioned-but-unreleased period, not just 'active' --
 * and only stops being exclusive once an operator takes the separate,
 * explicit "release subdomain" action
 * (`TenantProvisioningService.releaseSubdomain()`), which is the only
 * thing that ever sets `subdomain_released_at`. This is deliberately NOT
 * automatic on deprovision: old logins/emails/audit reports/bookmarks may
 * still reference the deprovisioned tenant's URL, and silently handing
 * that same subdomain to an unrelated new hospital is exactly the kind of
 * surprise a regulated, audit-sensitive platform like this one should
 * never produce as a side effect. Releasing is a conscious decision an
 * operator makes after confirming the old tenant's history no longer
 * needs to "own" that subdomain string.
 *
 * The old row is never touched by this: its `subdomain` value, `status`,
 * and every table with a `tenant_id` foreign key pointing at it (audit
 * logs, licenses, users, connector pairings, ...) remain exactly as they
 * were. A subsequent provision() under the same subdomain string
 * (once released) creates a brand-new `Tenant` row with a new UUID --
 * "same subdomain, different tenant" is the whole point, not "the old
 * tenant reactivated."
 */
export class TenantSubdomainReleaseLifecycle1785100000000 implements MigrationInterface {
  name = 'TenantSubdomainReleaseLifecycle1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "subdomain_released_at" TIMESTAMPTZ NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "UQ_tenant_subdomain";
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tenant_subdomain_unreleased"
      ON "tenant" ("subdomain")
      WHERE "subdomain_released_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverses cleanly PROVIDED no two rows currently share a `subdomain`
    // value (one released, one not, or two both released) -- if such rows
    // exist, re-adding the old unconditional UNIQUE constraint below will
    // fail with a standard Postgres constraint-violation error, which is
    // the correct, safe failure mode: this down() must not silently drop
    // data or pick a winner between two now-colliding rows.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_tenant_subdomain_unreleased";`);
    await queryRunner.query(`ALTER TABLE "tenant" ADD CONSTRAINT "UQ_tenant_subdomain" UNIQUE ("subdomain");`);
    await queryRunner.query(`ALTER TABLE "tenant" DROP COLUMN IF EXISTS "subdomain_released_at";`);
  }
}
