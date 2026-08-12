import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GAP-4: Add token_prefix column to token_locations.
 *
 * The architecture spec (§3.5) defines token_prefix on token_locations
 * so that each location can display tokens with a prefix (e.g. "G-042").
 * This was missing from the initial entity and Phase 1 migration.
 *
 * Default is '' (empty string) so all existing locations are unaffected.
 */
export class AddTokenPrefixToLocations1751400000001 implements MigrationInterface {
  name = 'AddTokenPrefixToLocations1751400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "token_locations"
        ADD COLUMN IF NOT EXISTS "token_prefix" VARCHAR(10) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "token_locations"
        DROP COLUMN IF EXISTS "token_prefix"
    `);
  }
}
