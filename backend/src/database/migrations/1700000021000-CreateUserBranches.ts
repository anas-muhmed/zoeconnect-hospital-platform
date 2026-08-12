import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBranches1700000021000 implements MigrationInterface {
  name = 'CreateUserBranches1700000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_branches" (
        "user_id"    UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "branch_id"  VARCHAR(30) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_user_branches" PRIMARY KEY ("user_id", "branch_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_user_branches_user_id"   ON "user_branches" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_user_branches_branch_id" ON "user_branches" ("branch_id")`);

    await queryRunner.query(`ALTER TABLE "token_locations" ADD COLUMN IF NOT EXISTS "branch_id" VARCHAR(30)`);
    await queryRunner.query(`CREATE INDEX "idx_token_locations_branch_id" ON "token_locations" ("branch_id")`);

    await queryRunner.query(`ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "branch_id" VARCHAR(30)`);
    await queryRunner.query(`CREATE INDEX "idx_loyalty_accounts_branch_id" ON "loyalty_accounts" ("branch_id")`);

    await queryRunner.query(`ALTER TABLE "eic_patients" ADD COLUMN IF NOT EXISTS "branch_id" VARCHAR(30)`);
    await queryRunner.query(`CREATE INDEX "idx_eic_patients_branch_id" ON "eic_patients" ("branch_id")`);

    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description")
      VALUES
        ('PLATFORM','BRANCH','READ',   'View branches and branch assignments'),
        ('PLATFORM','BRANCH','MANAGE', 'Assign branches to users')
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
        FROM "roles" r, "permissions" p
       WHERE r.name = 'SUPER_ADMIN'
         AND p.module_code = 'PLATFORM'
         AND p.resource = 'BRANCH'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE module_code = 'PLATFORM' AND resource = 'BRANCH'`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eic_patients_branch_id"`);
    await queryRunner.query(`ALTER TABLE "eic_patients" DROP COLUMN IF EXISTS "branch_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_loyalty_accounts_branch_id"`);
    await queryRunner.query(`ALTER TABLE "loyalty_accounts" DROP COLUMN IF EXISTS "branch_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_token_locations_branch_id"`);
    await queryRunner.query(`ALTER TABLE "token_locations" DROP COLUMN IF EXISTS "branch_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_branches_branch_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_branches_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_branches"`);
  }
}
