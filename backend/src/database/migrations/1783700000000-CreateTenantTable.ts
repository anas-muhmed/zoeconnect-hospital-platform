import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Task 1.1).
 *
 * Creates the `tenant` table. Purely additive — no existing table is
 * touched, nothing yet references this table, and no application code
 * reads from it until TenantContextService (this same task) and later
 * phases consume it. Zero observable behavior change for any deployment.
 */
export class CreateTenantTable1783700000000 implements MigrationInterface {
  name = 'CreateTenantTable1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "tenant_status_enum" AS ENUM ('active', 'inactive');

      CREATE TABLE "tenant" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "code"       VARCHAR(50) NOT NULL,
        "name"       VARCHAR(255) NOT NULL,
        "subdomain"  VARCHAR(255),
        "status"     "tenant_status_enum" NOT NULL DEFAULT 'active',
        "is_system"  BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_tenant" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_code" UNIQUE ("code")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "tenant";
      DROP TYPE "tenant_status_enum";
    `);
  }
}
