import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-scope `cms_display_assignments.slug` (production incident, 2026-08:
 * "CMS Player is global instead of tenant-scoped").
 *
 * ROOT CAUSE: `cms_display_assignments.slug` has been globally
 * `UNIQUE` since the table's creation (`UQ_cms_display_assignments_slug`,
 * `1783490000000-CreateCmsModule.ts`). `tenant_id` was added later
 * (`1783790000000-AddTenantIdToCmsTables.ts`, backfilled to the seeded
 * 'default' tenant for every existing row) but the slug uniqueness
 * constraint was never widened to match -- `CmsDisplayService.create()`
 * and `.findBySlug()` (both still call the raw, unscoped
 * `assignmentRepo.findOne({ where: { slug } })`, by explicit design --
 * see that service's own "chain-resolved, deferred to B5" comments) are
 * therefore the SAME shape of gap Task 10 already fixed for
 * `TokenKiosk.kioskSlug` and `HisSchemaConfig.configKey` -- just not
 * caught in that sweep because the CMS module wasn't in its scope. In
 * practice this means only ONE tenant in the entire system can ever
 * register a display named e.g. "main": a second tenant's admin hits a
 * 409 Conflict trying to create their own "main" display, or -- if
 * their physical player is ever pointed at the same slug -- would
 * receive the FIRST tenant's playlist/media/publish-version content
 * instead of their own. Same template as
 * `1783890000000-Task10TenantScopedUniqueConstraints.ts`; see that
 * file's own header for the full step-by-step rationale (backfill ->
 * duplicate check -> drop old constraint -> NOT NULL -> new composite
 * constraint).
 *
 * Companion code changes shipped in this same pass (not part of this
 * migration file): `CMSDisplayAssignment.tenantId` changed from
 * `nullable: true` to `nullable: false` (documentation-only -- this repo
 * runs with `synchronize: false` everywhere, migrations are the real
 * schema source of truth) and `.slug`'s `unique: true` removed (the real
 * constraint is now the composite index added by this migration);
 * `CmsDisplayService.findBySlug()`/`.create()`/`.getActiveContent()`/
 * `.heartbeat()`/`.reportHealth()` now take an explicit `tenantId`
 * parameter and filter on it; `CmsDisplayController`'s public
 * `player/:slug/*` routes now read `req.tenantId` (already resolved on
 * every request by `SubdomainTenantMiddleware`'s Fastify `onRequest`
 * hook in `main.ts` -- this migration does not change how that value is
 * produced, only what the CMS player does with a value that was already
 * available on every request and simply never consulted).
 */
export class TenantScopeCmsDisplayAssignmentSlug1790900000000 implements MigrationInterface {
  name = 'TenantScopeCmsDisplayAssignmentSlug1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Step 1: backfill NULL tenant_id -> seeded 'default' tenant ---------
    // Expected to be a no-op in practice (1783790000000 already backfilled
    // every row at the time it ran, and CmsDisplayService.create() has
    // used TenantContextStorage.requireTenantContext() -- fail-fast, never
    // silently NULL -- since the 2026-08-07 incident fix referenced in that
    // service's own comment). Kept anyway, unconditionally, as the same
    // defensive precondition every other migration in this tenant-scoped-
    // identity series applies before adding a composite unique constraint:
    // Postgres treats every NULL as distinct, so a composite unique index
    // does NOT by itself catch two NULL-tenant rows sharing a slug.
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "cms_display_assignments" WHERE "tenant_id" IS NULL;`,
    );
    if (Number(count) > 0) {
      console.log(
        `[TenantScopeCmsDisplayAssignmentSlug] "cms_display_assignments": backfilling ${count} row(s) with NULL tenant_id -> 'default' tenant`,
      );
    }

    await queryRunner.query(`
      UPDATE "cms_display_assignments"
      SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
      WHERE "tenant_id" IS NULL;
    `);

    const [{ remaining }] = await queryRunner.query(
      `SELECT COUNT(*) AS remaining FROM "cms_display_assignments" WHERE "tenant_id" IS NULL;`,
    );
    if (Number(remaining) > 0) {
      throw new Error(
        `[TenantScopeCmsDisplayAssignmentSlug] "cms_display_assignments" still has ${remaining} row(s) with NULL tenant_id after ` +
        `backfill -- does the 'default' tenant exist (SELECT * FROM "tenant" WHERE "code" = 'default')? Aborting migration.`,
      );
    }

    // -- Step 2: post-backfill duplicate check -------------------------------
    // Logically impossible today (the OLD constraint was already globally
    // unique on slug alone, a strictly narrower guarantee than the new
    // composite one), but executed anyway as a safety net, matching every
    // other uniqueness migration in this series.
    const duplicates = await queryRunner.query(`
      SELECT "tenant_id", "slug", COUNT(*) AS count
      FROM "cms_display_assignments"
      GROUP BY "tenant_id", "slug"
      HAVING COUNT(*) > 1;
    `);
    if (duplicates.length > 0) {
      const describe = duplicates
        .map((r: Record<string, string>) => `(tenant_id=${r.tenant_id}, slug=${r.slug}, count=${r.count})`)
        .join('; ');
      throw new Error(
        `[TenantScopeCmsDisplayAssignmentSlug] Found duplicate rows in "cms_display_assignments" that would violate ` +
        `the new composite unique constraint -- resolve manually before re-running this migration. ${describe}.`,
      );
    }

    // -- Step 3: drop the old global unique constraint -----------------------
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" DROP CONSTRAINT IF EXISTS "UQ_cms_display_assignments_slug";`);

    // -- Step 4: tenant_id NOT NULL -------------------------------------------
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" ALTER COLUMN "tenant_id" SET NOT NULL;`);

    // -- Step 5: new composite unique constraint ------------------------------
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" ADD CONSTRAINT "UQ_cms_display_assignments_tenant_slug" UNIQUE ("tenant_id", "slug");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverses cleanly PROVIDED no data now depends on the composite
    // constraint's wider allowance (two tenants both using the same display
    // slug) -- if such rows exist, re-adding the old single-column global
    // unique constraint below will fail with a standard Postgres
    // constraint-violation error, which is the correct, safe failure mode:
    // this down() must not silently drop data or pick a winner between two
    // now-colliding rows. Same posture as Task 10's down().
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" DROP CONSTRAINT "UQ_cms_display_assignments_tenant_slug";`);
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" ALTER COLUMN "tenant_id" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "cms_display_assignments" ADD CONSTRAINT "UQ_cms_display_assignments_slug" UNIQUE ("slug");`);
  }
}
