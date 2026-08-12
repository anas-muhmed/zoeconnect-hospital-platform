import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cloud Token Queue Display cross-tenant blank-screen bug (real incident,
 * 2026-07-31): the public `/token/display?location=<code>` board resolves
 * its tenant via `SubdomainTenantMiddleware`, which extracts a subdomain
 * from the request hostname. Per the ZoeConnect Identity Architecture
 * Migration (Phase 6), cloud tenants no longer have per-tenant subdomains --
 * they share one hostname -- so that resolution always falls back to the
 * seeded 'default' tenant. Since `token_locations.code` is unique only
 * PER TENANT (1785800000000-PerTenantTokenLocations.ts), the display's
 * lookup for a real cloud tenant's location code then matches zero rows
 * under 'default', and the board renders blank.
 *
 * Fix, following the exact precedent already established by
 * `display_pages.slug` (1700000019000-CreateDisplayPages.ts) and
 * `cms_display_assignments.slug`: give every location a globally-unique
 * `display_token`, and have the public display board look itself up by
 * that token with a raw (non-tenant-scoped) query instead of depending on
 * hostname-based tenant resolution at all. The location row's own
 * `tenant_id` becomes the source of truth for every downstream lookup
 * (REST + the TokenGateway websocket connection), sidestepping
 * SubdomainTenantMiddleware entirely for this path.
 *
 * `code`-based lookup is left fully intact for backward compatibility
 * (self-hosted, single-tenant deployments were never affected by this bug
 * in the first place, since 'default' IS their only tenant).
 */
export class AddDisplayTokenToTokenLocations1789100000000
  implements MigrationInterface
{
  name = 'AddDisplayTokenToTokenLocations1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "token_locations"
        ADD COLUMN IF NOT EXISTS "display_token" VARCHAR(32) NULL
    `);

    // Backfill every existing row with a random, globally-unique token so
    // already-deployed locations get a working display URL too, not just
    // ones created after this migration.
    await queryRunner.query(`
      UPDATE "token_locations"
      SET "display_token" = replace(gen_random_uuid()::text, '-', '')
      WHERE "display_token" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_locations_display_token"
        ON "token_locations" ("display_token")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_token_locations_display_token"`);
    await queryRunner.query(`ALTER TABLE "token_locations" DROP COLUMN IF EXISTS "display_token"`);
  }
}
