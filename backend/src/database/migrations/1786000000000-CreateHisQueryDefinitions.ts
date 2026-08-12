import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D.3 ("Dynamic Per-Tenant HIS Query Architecture" Publisher, 2026-07-21) —
 * `his_query_definitions` table.
 *
 * Backs `HisQueryDefinition` (see that entity's doc comment). No hard FK
 * constraint against `tenant` -- same "logical FK, no DB constraint"
 * convention as every other tenant-scoped table added this session
 * (`connector_instances`, `token_locations`, `system_settings`).
 */
export class CreateHisQueryDefinitions1786000000000 implements MigrationInterface {
  name = 'CreateHisQueryDefinitions1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "his_query_definitions" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"           uuid NOT NULL,
        "query_id"            varchar(100) NOT NULL,
        "kind"                varchar(10) NOT NULL,
        "sql"                 text NOT NULL,
        "expected_binds"      jsonb NOT NULL DEFAULT '[]'::jsonb,
        "checksum"            varchar(16) NOT NULL,
        "definition_version"  integer NOT NULL DEFAULT 1,
        "compiled_at"         timestamptz NOT NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_his_query_definitions_tenant_query"
      ON "his_query_definitions" ("tenant_id", "query_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "his_query_definitions";`);
  }
}
