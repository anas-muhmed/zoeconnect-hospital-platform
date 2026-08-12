import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 (additive-only).
 *
 * Creates `organization_branches` -- a new, ZoeConnect-native branch concept
 * used ONLY when Oracle HIS is not connected for a tenant. This is a
 * deliberately separate, independent table from the existing HIS-sourced
 * `Branch` flow (`src/modules/branch/branch.service.ts`, which queries
 * Oracle's live `orgstructure` table directly and has no backing table of
 * its own). Nothing about the existing Oracle HIS branch flow is touched,
 * redesigned, or replaced by this migration.
 *
 * "Organization" = the existing `Tenant` row conceptually, per explicit
 * project-owner instruction -- `Tenant`/`tenant_id` is NOT renamed anywhere
 * in this phase, and no separate "Organization" table is introduced.
 * `tenant_id` below carries a real FK to `tenant.id`.
 *
 * Constraints:
 *  - UNIQUE (tenant_id, code) -- a branch code must be unique within its
 *    tenant, but the same code (e.g. 'main') is expected to repeat across
 *    many tenants.
 *  - Partial unique index on (tenant_id) WHERE is_default -- at most one
 *    default branch per tenant, enforced at the DB level (not just app
 *    logic), same pattern as Tenant's own partial unique subdomain index
 *    (1785100000000-TenantSubdomainReleaseLifecycle.ts).
 *
 * Backfill: inserts exactly one default `organization_branches` row
 * ('Main Branch' / code 'main') for every existing `tenant` row. Idempotent
 * via `ON CONFLICT ("tenant_id","code") DO NOTHING` -- safe to re-run
 * (e.g. if this migration is re-applied after a partial failure, or a new
 * tenant is added between two runs in a dev environment).
 */
export class CreateOrganizationBranches1788400000000 implements MigrationInterface {
  name = 'CreateOrganizationBranches1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_branches" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"  uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "name"       varchar(255) NOT NULL,
        "code"       varchar(100) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "status"     varchar(20) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_organization_branches_tenant_code" UNIQUE ("tenant_id", "code")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_organization_branches_tenant_default"
      ON "organization_branches" ("tenant_id")
      WHERE "is_default" = true;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_organization_branches_tenant"
      ON "organization_branches" ("tenant_id");
    `);

    // -- Backfill: one default branch per existing tenant, idempotent -----
    await queryRunner.query(`
      INSERT INTO "organization_branches" ("id", "tenant_id", "name", "code", "is_default", "status")
      SELECT gen_random_uuid(), t."id", 'Main Branch', 'main', true, 'active'
      FROM "tenant" t
      ON CONFLICT ("tenant_id", "code") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_organization_branches_tenant";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_organization_branches_tenant_default";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_branches";`);
  }
}
