import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D.6 ("Onboarding UX," 2026-07-22) — adds `expires_at` to
 * `tenant_connector_pairings`, backing the new human-typeable Activation
 * Code's validity window. Nullable so every pre-existing row (generated
 * under the old opaque-token design, which never expired) is treated as
 * "never expires" — see `TenantConnectorPairing`'s own doc comment.
 */
export class AddExpiresAtToConnectorPairings1786100000000 implements MigrationInterface {
  name = 'AddExpiresAtToConnectorPairings1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_connector_pairings"
      ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_connector_pairings"
      DROP COLUMN IF EXISTS "expires_at";
    `);
  }
}
