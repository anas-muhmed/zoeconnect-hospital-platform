import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the table backing WorkstationConfig
 * (backend/src/modules/token/workstation/entities/workstation-config.entity.ts,
 * @Entity('hdsp_workstation_configuration')).
 *
 * Bug: the entity, WorkstationService, WorkstationController, and the
 * entire workstation-based popup/panel Registration Assistant frontend
 * (useWorkstationSession.ts, workstation.api.ts) were all built and wired
 * up, but no migration ever created this table -- every call to
 * GET/POST /token/workstation/:workstationId failed with
 * `relation "hdsp_workstation_configuration" does not exist` the moment
 * anyone actually opened the Registration Assistant panel/popup.
 *
 * Column set matches the entity exactly: workstationId (unique, client-
 * generated UUID stored in the browser's localStorage), branchId, a
 * location + counter pointer, an optional supervisor lock, and audit
 * fields. FKs to token_locations/token_counters ON DELETE CASCADE, since a
 * workstation config that points at a since-deleted location/counter is
 * meaningless -- matches the cascade pattern already used for
 * token_reservations -> token_records elsewhere in this schema.
 */
export class CreateWorkstationConfiguration1783430000000 implements MigrationInterface {
  name = 'CreateWorkstationConfiguration1783430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hdsp_workstation_configuration" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "workstation_id" UUID         NOT NULL,
        "branch_id"      VARCHAR(30)  NOT NULL,
        "location_id"    UUID         NOT NULL,
        "counter_id"     UUID         NOT NULL,
        "locked"         BOOLEAN      NOT NULL DEFAULT FALSE,
        "configured_by"  VARCHAR(100),
        "configured_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "last_seen_at"   TIMESTAMPTZ,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_hdsp_workstation_configuration" PRIMARY KEY ("id"),
        CONSTRAINT "uq_hwc_workstation_id" UNIQUE ("workstation_id"),
        CONSTRAINT "fk_hwc_location"
          FOREIGN KEY ("location_id") REFERENCES "token_locations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_hwc_counter"
          FOREIGN KEY ("counter_id") REFERENCES "token_counters" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hwc_branch"
        ON "hdsp_workstation_configuration" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_hwc_location"
        ON "hdsp_workstation_configuration" ("location_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "hdsp_workstation_configuration"`);
  }
}
