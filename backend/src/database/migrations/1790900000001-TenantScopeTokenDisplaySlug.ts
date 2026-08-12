import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantScopeTokenDisplaySlug1790900000001 implements MigrationInterface {
  name = 'TenantScopeTokenDisplaySlug1790900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Step 1: backfill NULL tenant_id -> seeded 'default' tenant ---------
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "display_pages" WHERE "tenant_id" IS NULL;`,
    );
    if (Number(count) > 0) {
      console.log(
        `[TenantScopeTokenDisplaySlug] "display_pages": backfilling ${count} row(s) with NULL tenant_id -> 'default' tenant`,
      );
    }

    await queryRunner.query(`
      UPDATE "display_pages"
      SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
      WHERE "tenant_id" IS NULL;
    `);

    const [{ remaining }] = await queryRunner.query(
      `SELECT COUNT(*) AS remaining FROM "display_pages" WHERE "tenant_id" IS NULL;`,
    );
    if (Number(remaining) > 0) {
      throw new Error(
        `[TenantScopeTokenDisplaySlug] "display_pages" still has ${remaining} row(s) with NULL tenant_id after ` +
        `backfill -- does the 'default' tenant exist (SELECT * FROM "tenant" WHERE "code" = 'default')? Aborting migration.`,
      );
    }

    // -- Step 2: post-backfill duplicate check -------------------------------
    const duplicates = await queryRunner.query(`
      SELECT "tenant_id", "slug", COUNT(*) AS count
      FROM "display_pages"
      GROUP BY "tenant_id", "slug"
      HAVING COUNT(*) > 1;
    `);
    if (duplicates.length > 0) {
      const describe = duplicates
        .map((r: Record<string, string>) => `(tenant_id=${r.tenant_id}, slug=${r.slug}, count=${r.count})`)
        .join('; ');
      throw new Error(
        `[TenantScopeTokenDisplaySlug] Found duplicate rows in "display_pages" that would violate ` +
        `the new composite unique constraint -- resolve manually before re-running this migration. ${describe}.`,
      );
    }

    // -- Step 3: drop the old global unique constraint -----------------------
    await queryRunner.query(`ALTER TABLE "display_pages" DROP CONSTRAINT IF EXISTS "UQ_6c0fa168a6fdf94291c9d2c1800";`);
    await queryRunner.query(`ALTER TABLE "display_pages" DROP CONSTRAINT IF EXISTS "UQ_display_pages_slug";`);
    
    // Fallback: Drop constraint by looking it up if it has a random hash
    await queryRunner.query(`
      DO $$ 
      DECLARE
          constraint_name TEXT;
      BEGIN
          SELECT conname INTO constraint_name
          FROM pg_constraint
          WHERE conrelid = 'display_pages'::regclass
            AND contype = 'u'
            AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'display_pages'::regclass AND attname = 'slug');
          
          IF constraint_name IS NOT NULL THEN
              EXECUTE 'ALTER TABLE display_pages DROP CONSTRAINT ' || quote_ident(constraint_name);
          END IF;
      END $$;
    `);

    // -- Step 4: tenant_id NOT NULL -------------------------------------------
    await queryRunner.query(`ALTER TABLE "display_pages" ALTER COLUMN "tenant_id" SET NOT NULL;`);

    // -- Step 5: new composite unique constraint ------------------------------
    await queryRunner.query(`ALTER TABLE "display_pages" ADD CONSTRAINT "UQ_display_pages_tenant_slug" UNIQUE ("tenant_id", "slug");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "display_pages" DROP CONSTRAINT "UQ_display_pages_tenant_slug";`);
    await queryRunner.query(`ALTER TABLE "display_pages" ALTER COLUMN "tenant_id" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "display_pages" ADD CONSTRAINT "UQ_display_pages_slug" UNIQUE ("slug");`);
  }
}
