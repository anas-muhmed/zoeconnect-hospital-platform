import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A4).
 *
 * Adds a nullable `tenant_id` to users/RBAC tables (users, roles,
 * permissions, password_reset_requests) and backfills every existing row
 * to the seeded 'default' tenant, looked up by `code` (see Checkpoint
 * A1/A2/A3).
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Deliberately
 * does NOT touch the join tables (user_roles, role_permissions,
 * user_permissions) — those remain entirely unchanged in this
 * checkpoint; tenant scoping for join-table rows is derivable from their
 * parent user/role once needed, and adding tenant_id to join tables
 * before it's actually consumed would be premature scope for Stage A.
 *
 * Raw-SQL/manual-construction review (see chat record) confirmed no
 * runtime SELECT statements against these four tables would be affected,
 * and the one raw INSERT found (seed-platform.ts, explicit column list)
 * is unaffected since the new column is nullable with no default.
 */
export class AddTenantIdToAuthRbacTables1783740000000 implements MigrationInterface {
  name = 'AddTenantIdToAuthRbacTables1783740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['users', 'roles', 'permissions', 'password_reset_requests'];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "tenant_id" UUID;`);
      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_${table}_tenant_id" ON "${table}" ("tenant_id");`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['users', 'roles', 'permissions', 'password_reset_requests'];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
