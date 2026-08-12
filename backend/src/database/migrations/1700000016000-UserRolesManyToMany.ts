import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRolesManyToMany1700000016000 implements MigrationInterface {
  name = 'UserRolesManyToMany1700000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the join table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_user_roles_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_roles_role" FOREIGN KEY ("role_id")
          REFERENCES "roles" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_user_id" ON "user_roles" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_role_id" ON "user_roles" ("role_id")
    `);

    // 2. Migrate existing role_id data → user_roles join table
    await queryRunner.query(`
      INSERT INTO "user_roles" ("user_id", "role_id")
      SELECT "id", "role_id"
      FROM "users"
      WHERE "role_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    // 3. Drop the old role_id column (no longer needed)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add role_id column
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "role_id" uuid
    `);

    // Restore first role for each user
    await queryRunner.query(`
      UPDATE "users" u
      SET "role_id" = (
        SELECT ur."role_id"
        FROM "user_roles" ur
        WHERE ur."user_id" = u."id"
        LIMIT 1
      )
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_roles_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
  }
}
