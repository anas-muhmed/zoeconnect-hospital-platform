import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-Scoped User Identity, Task 1 (Data Hygiene Precondition).
 *
 * See TENANT_SCOPED_IDENTITY_AUDIT.md and
 * TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md — Task 1.
 *
 * Why this exists: `1783740000000-AddTenantIdToAuthRbacTables.ts` added a
 * nullable `tenant_id` to `users`/`roles`/`permissions`/
 * `password_reset_requests` and backfilled every row that existed AT THAT
 * MIGRATION'S RUN TIME to the seeded 'default' tenant. It could not — and
 * did not attempt to — cover rows inserted AFTER that migration ran via a
 * path that doesn't stamp `tenant_id`. `seed-platform.ts` is exactly such a
 * path: its raw-SQL `INSERT INTO "users" (...)` / `INSERT INTO "roles" (...)`
 * statements never included `tenant_id` (see this migration's sibling fix
 * to that file), so any fresh dev/test database seeded after
 * 1783740000000 landed still gets `tenant_id: NULL` rows today.
 *
 * This matters because a future composite unique index — `UNIQUE
 * (tenant_id, username)` — would NOT prevent duplicates among `NULL`-tenant
 * rows: Postgres treats every `NULL` as distinct from every other `NULL` in
 * a unique index, so two `NULL`-tenant rows with the same username would
 * silently defeat the exact constraint meant to catch that. This migration
 * is the precondition that closes that gap before any uniqueness work
 * (Task 2's `hisEmployeeCode` index, Task 5's composite constraints) can
 * safely proceed — re-running the identical backfill `1783740000000` did,
 * scoped to `users`/`roles` (the two tables this identity work touches),
 * idempotent and safe to run on a database that has no `NULL` rows left
 * (the `WHERE tenant_id IS NULL` guard makes every statement a no-op in
 * that case).
 *
 * Deliberately does NOT touch `permissions`/`password_reset_requests` —
 * out of scope for Task 1, which is scoped to identity tables only per the
 * implementation plan; `permissions` is a legitimately global catalog (see
 * OWNERSHIP_MODEL_AUDIT.md) and was never at risk of the same class of gap.
 */
export class BackfillTenantIdDataHygiene1783860000000 implements MigrationInterface {
  name = 'BackfillTenantIdDataHygiene1783860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['users', 'roles'];

    for (const table of tables) {
      // Pre-backfill visibility: surfaces in migration output/logs so an
      // operator running this against a real environment sees exactly how
      // many rows this migration is about to touch, before it touches them.
      const [{ count }] = await queryRunner.query(
        `SELECT COUNT(*) AS count FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      if (Number(count) > 0) {
        console.log(
          `[BackfillTenantIdDataHygiene] "${table}": backfilling ${count} row(s) with NULL tenant_id -> 'default' tenant`,
        );
      }

      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT "id" FROM "tenant" WHERE "code" = 'default')
        WHERE "tenant_id" IS NULL;
      `);

      // Post-backfill verification: fail loudly rather than silently leaving
      // a NULL row behind (e.g. if the 'default' tenant itself doesn't
      // exist in this database for some reason -- the subselect above would
      // then set tenant_id to NULL again, a no-op UPDATE).
      const [{ remaining }] = await queryRunner.query(
        `SELECT COUNT(*) AS remaining FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      if (Number(remaining) > 0) {
        throw new Error(
          `[BackfillTenantIdDataHygiene] "${table}" still has ${remaining} row(s) with NULL tenant_id after backfill -- ` +
          `does the 'default' tenant exist (SELECT * FROM "tenant" WHERE "code" = 'default')? Aborting migration.`,
        );
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately a no-op. This migration only backfills data that was
    // already NULL (a lossy, one-directional repair, not a schema change);
    // there is no record of which rows were NULL before it ran, so
    // "reverting" by re-nulling tenant_id would be actively harmful --
    // it would reopen the exact hole this migration exists to close, on
    // any row a later migration or the running application has since come
    // to depend on having a real tenant_id. Matches the precedent set by
    // this repo's other data-only migrations where reversal isn't
    // meaningful (see 1783820000000-BackfillDefaultRolePermissions.ts's
    // down(), which reverses its own inserts but has no equivalent "put the
    // NULL back" concept to reverse here).
  }
}
