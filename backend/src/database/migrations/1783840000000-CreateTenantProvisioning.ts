import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 ("Tenant Provisioning", Task 10.1). Creates the tables backing
 * `TenantProvisioningService`'s step-runner (see that service's own doc
 * comment for why this is purpose-built rather than reusing
 * `document-platform`'s workflow-engine -- that module turned out, on
 * inspection, to be a document-approval state machine, not a generic
 * multi-step process runner, so the spec's "build on existing
 * Workflow-engine primitives" assumption did not hold).
 *
 * Also adds a real unique constraint on `tenant.subdomain` -- a genuine
 * pre-existing gap found during this phase's pre-flight: the column has
 * been nullable-and-unenforced since Phase 1, and Phase 8's
 * `SubdomainTenantMiddleware`/`TenantContextService.resolveTenantBySubdomain()`
 * already silently assume subdomain uniqueness (an `.findOne()` lookup,
 * not a `.find()` returning candidates) without the database ever
 * enforcing it. Purely additive for every existing row (all currently
 * NULL except the seeded 'default' tenant, which also has a NULL
 * subdomain per Phase 1) -- Postgres allows any number of NULLs in a
 * unique index, so this cannot fail against existing data.
 */
export class CreateTenantProvisioning1783840000000 implements MigrationInterface {
  name = 'CreateTenantProvisioning1783840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant" ADD CONSTRAINT "UQ_tenant_subdomain" UNIQUE ("subdomain");

      CREATE TABLE "tenant_provisioning_runs" (
        "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"           UUID,
        "requested_hospital_name" VARCHAR(255) NOT NULL,
        "requested_subdomain"     VARCHAR(255) NOT NULL,
        "requested_admin_username" VARCHAR(100) NOT NULL,
        "requested_admin_email"    VARCHAR(255) NOT NULL,
        "requested_admin_full_name" VARCHAR(255),
        "status"              VARCHAR(20) NOT NULL DEFAULT 'in_progress',
        "current_step_number" INT NOT NULL DEFAULT 1,
        "error"               TEXT,
        "triggered_by"        VARCHAR(255),
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "completed_at"        TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_provisioning_runs" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tenant_provisioning_runs_status"
          CHECK ("status" IN ('in_progress', 'completed', 'failed'))
      );

      CREATE INDEX "IDX_tenant_provisioning_runs_tenant_id" ON "tenant_provisioning_runs" ("tenant_id");
      CREATE INDEX "IDX_tenant_provisioning_runs_status" ON "tenant_provisioning_runs" ("status");

      CREATE TABLE "tenant_provisioning_steps" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "run_id"       UUID NOT NULL,
        "step_number"  INT NOT NULL,
        "step_name"    VARCHAR(100) NOT NULL,
        "status"       VARCHAR(20) NOT NULL DEFAULT 'pending',
        "attempts"     INT NOT NULL DEFAULT 0,
        "last_error"   TEXT,
        "result_data"  JSONB,
        "started_at"   TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_provisioning_steps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tenant_provisioning_steps_run"
          FOREIGN KEY ("run_id") REFERENCES "tenant_provisioning_runs" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_tenant_provisioning_steps_run_step" UNIQUE ("run_id", "step_number"),
        CONSTRAINT "CHK_tenant_provisioning_steps_status"
          CHECK ("status" IN ('pending', 'in_progress', 'succeeded', 'failed'))
      );

      CREATE INDEX "IDX_tenant_provisioning_steps_run_id" ON "tenant_provisioning_steps" ("run_id");

      -- Task 10.4 (spec Section 8.1 step 7): Connector pairing credential.
      -- Stores a HASH only (bcrypt, mirroring password storage conventions
      -- elsewhere in this codebase) -- the raw pairing key is returned to
      -- the caller exactly once, at generation time, via the admin API
      -- response, and never persisted in plaintext. See
      -- TenantConnectorPairing entity's doc comment for the documented gap
      -- this table does NOT close: nothing in the Connector's Message
      -- Transport protocol (Phase 6) actually verifies this key yet.
      CREATE TABLE "tenant_connector_pairings" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID NOT NULL,
        "pairing_key_hash" VARCHAR(255) NOT NULL,
        "status"           VARCHAR(20) NOT NULL DEFAULT 'pending',
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "revoked_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_tenant_connector_pairings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tenant_connector_pairings_status"
          CHECK ("status" IN ('pending', 'active', 'revoked'))
      );

      CREATE INDEX "IDX_tenant_connector_pairings_tenant_id" ON "tenant_connector_pairings" ("tenant_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "tenant_connector_pairings";
      DROP TABLE IF EXISTS "tenant_provisioning_steps";
      DROP TABLE IF EXISTS "tenant_provisioning_runs";
      ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "UQ_tenant_subdomain";
    `);
  }
}
