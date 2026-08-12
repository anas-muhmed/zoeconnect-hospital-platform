import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 017 — User-level direct permissions
 *
 * Adds user_permissions junction table so individual permissions can be
 * assigned directly to a user in addition to whatever their roles grant.
 *
 * Effective permissions = union(role permissions, direct user permissions).
 */
export class CreateUserPermissions1700000017000 implements MigrationInterface {
  name = 'CreateUserPermissions1700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_permissions" (
        "user_id"       UUID NOT NULL REFERENCES "users"("id")       ON DELETE CASCADE,
        "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "granted_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "granted_by"    UUID        REFERENCES "users"("id")         ON DELETE SET NULL,
        CONSTRAINT "pk_user_permissions" PRIMARY KEY ("user_id", "permission_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_permissions_user" ON "user_permissions"("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_permissions" CASCADE`);
  }
}
