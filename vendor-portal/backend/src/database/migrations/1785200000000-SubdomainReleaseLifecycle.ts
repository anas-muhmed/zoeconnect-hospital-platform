import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subdomain Release Lifecycle -- Vendor Portal side.
 *
 * Mirrors ZoeConnect's own 1785100000000-TenantSubdomainReleaseLifecycle.ts:
 * `UQ_cloud_tenants_subdomain` (added by 1784203761689-CreateCloudTenants.ts)
 * is a plain, unconditional UNIQUE constraint, which combined with
 * `CloudTenantsService.provision()`'s existing guard
 * (`existing.provisioningStatus !== 'FAILED'` blocks reuse) meant a
 * deprovisioned tenant's subdomain was blocked forever in Vendor Portal's
 * own reference table too, on top of ZoeConnect's identical problem.
 *
 * Replaces the unconditional constraint with a partial one scoped to
 * `subdomain_released_at IS NULL` -- same semantics as the ZoeConnect-side
 * migration: a row keeps its subdomain reserved for as long as it's
 * unreleased (including its entire deprovisioned-but-unreleased period),
 * and stops blocking reuse only once `CloudTenantsService.releaseSubdomain()`
 * explicitly stamps this column, which it only does after ZoeConnect's own
 * release endpoint has confirmed success.
 */
export class SubdomainReleaseLifecycle1785200000000 implements MigrationInterface {
  name = 'SubdomainReleaseLifecycle1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cloud_tenants" ADD COLUMN IF NOT EXISTS "subdomain_released_at" TIMESTAMPTZ NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "cloud_tenants" DROP CONSTRAINT IF EXISTS "UQ_cloud_tenants_subdomain";
    `);

    // IF NOT EXISTS: this database runs with synchronize: true
    // (database.config.ts), and CloudTenant now declares this exact index
    // via an entity-level @Index decorator -- an app boot that races this
    // migration may have already created it. Same name on both sides
    // deliberately, so whichever runs first is a no-op for the other.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cloud_tenants_subdomain_unreleased"
      ON "cloud_tenants" ("subdomain")
      WHERE "subdomain_released_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Same caveat as the ZoeConnect-side down(): fails cleanly (not silently) if
    // two rows currently share a subdomain value, which is exactly the
    // correct behavior once this feature has actually been used to reuse one.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cloud_tenants_subdomain_unreleased";`);
    await queryRunner.query(`ALTER TABLE "cloud_tenants" ADD CONSTRAINT "UQ_cloud_tenants_subdomain" UNIQUE ("subdomain");`);
    await queryRunner.query(`ALTER TABLE "cloud_tenants" DROP COLUMN IF EXISTS "subdomain_released_at";`);
  }
}
