import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddTokenLocations — introduces location-scoped billing areas.
 *
 * Changes:
 *   1. New table  token_locations
 *   2. token_counters gains location_id + counter_number columns
 *   3. Existing counters migrated to a "General Billing" default location
 *   4. Old columns (code, label, display_order) removed from token_counters
 *   5. New permission TOKEN:LOCATION:MANAGE added
 */
export class AddTokenLocations1700000015000 implements MigrationInterface {
  name = 'AddTokenLocations1700000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. token_locations ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_locations" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"          VARCHAR(60)  NOT NULL,
        "label"         VARCHAR(100) NOT NULL,
        "is_active"     BOOLEAN      NOT NULL DEFAULT TRUE,
        "display_order" INT          NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_locations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_locations_code" UNIQUE ("code")
      )
    `);

    // ── 2. Add nullable columns to token_counters (nullable until data migrated) ─
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        ADD COLUMN IF NOT EXISTS "location_id"    UUID NULL,
        ADD COLUMN IF NOT EXISTS "counter_number" INT  NULL
    `);

    // ── 3. Seed default location for existing counters ─────────────────────
    await queryRunner.query(`
      INSERT INTO "token_locations" ("code", "label", "display_order")
      VALUES ('GENERAL_BILLING', 'General Billing', 0)
      ON CONFLICT ("code") DO NOTHING
    `);

    // ── 4. Assign existing counters sequential counter_number (ordered by display_order) ─
    await queryRunner.query(`
      WITH ordered AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY "display_order", "created_at") AS rn
        FROM   "token_counters"
        WHERE  "location_id" IS NULL
      )
      UPDATE "token_counters" tc
      SET
        "location_id"    = (SELECT id FROM "token_locations" WHERE code = 'GENERAL_BILLING'),
        "counter_number" = ordered.rn
      FROM ordered
      WHERE tc.id = ordered.id
    `);

    // ── 5. Make NOT NULL now that all rows have values ─────────────────────
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        ALTER COLUMN "location_id"    SET NOT NULL,
        ALTER COLUMN "counter_number" SET NOT NULL
    `);

    // ── 6. FK + unique constraint ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        ADD CONSTRAINT "fk_token_counters_location"
          FOREIGN KEY ("location_id") REFERENCES "token_locations"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "uq_token_counters_location_number"
          UNIQUE ("location_id", "counter_number")
    `);

    // ── 7. Drop old columns no longer needed ──────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        DROP COLUMN IF EXISTS "code",
        DROP COLUMN IF EXISTS "label",
        DROP COLUMN IF EXISTS "display_order"
    `);

    // ── 8. New permission ──────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description")
      VALUES ('TOKEN','LOCATION','MANAGE','Create/rename/deactivate billing locations')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore columns
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        ADD COLUMN IF NOT EXISTS "code"          VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "label"         VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "display_order" INT DEFAULT 0
    `);

    // Drop new constraints and columns
    await queryRunner.query(`
      ALTER TABLE "token_counters"
        DROP CONSTRAINT IF EXISTS "fk_token_counters_location",
        DROP CONSTRAINT IF EXISTS "uq_token_counters_location_number",
        DROP COLUMN IF EXISTS "location_id",
        DROP COLUMN IF EXISTS "counter_number"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "token_locations"`);
  }
}
