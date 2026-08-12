import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HDSP Connector, Phase A (2026-07-21) — `connector_instances` table.
 *
 * Backs `ConnectorInstance` (see that entity's doc comment for full
 * rationale). Foreign keys deliberately NOT declared as hard DB
 * constraints against `tenant`/`tenant_connector_pairings` — every other
 * tenant-scoped table added this session (token_locations,
 * system_settings, licensing rows) follows the same "logical FK, no DB
 * constraint" convention already established, to avoid migration-ordering
 * fragility across independently-deployable modules.
 */
export class CreateConnectorInstances1785900000000 implements MigrationInterface {
  name = 'CreateConnectorInstances1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connector_instances" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL,
        "pairing_id"        uuid NOT NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'registered',
        "version"           varchar(40),
        "hostname"          varchar(255),
        "last_heartbeat_at" timestamptz,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "revoked_at"        timestamptz
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_connector_instances_tenant"
      ON "connector_instances" ("tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_instances";`);
  }
}
