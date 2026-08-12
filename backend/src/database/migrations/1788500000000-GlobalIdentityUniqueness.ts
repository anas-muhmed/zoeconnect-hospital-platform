import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Identity Architecture Migration, Phase 4.
 *
 * Reverses `1783880000000-TenantScopedIdentityCompositeConstraints.ts`'s
 * `users(tenant_id, username)` / `users(tenant_id, email)` composite unique
 * constraints back to genuinely GLOBAL, CASE-INSENSITIVE uniqueness on
 * `username` and `email` -- the identity model the rest of this migration
 * (Phase 3's `AUTH_IDENTITY_MODE=global` login path) depends on.
 *
 * `roles(tenant_id, name)` (added by that same 1783880000000 migration) is
 * deliberately NOT touched here -- role names aren't login identifiers and
 * were never in scope for this phase; only `users.username`/`users.email`
 * are addressed.
 *
 * Safety model -- read this before ever running this against a real
 * customer database:
 *
 *   1. Pre-migration duplicate check, CASE-INSENSITIVELY, ACROSS ALL
 *      TENANTS. This is the same `GROUP BY LOWER(...)` query
 *      `npm run verify:global-identity`
 *      (src/scripts/verify-global-identity-uniqueness.ts) runs standalone --
 *      kept deliberately identical so a clean report from that script and
 *      "this migration will proceed" are always the same fact. Run that
 *      script first in any real environment; it gives full detail (affected
 *      tenant, affected user IDs) this migration's own abort message
 *      necessarily summarizes rather than reproduces in full.
 *   2. If ANY duplicate is found (same username, or same email, differing
 *      only by case, on two or more rows -- whether or not they're in
 *      different tenants): throw immediately. No data is modified, nothing
 *      is renamed, nothing is merged, and the constraint/index changes below
 *      never run. The thrown error names exactly how many username values
 *      and how many email values collided so an operator knows there's work
 *      to do, and points at the verification script for the full list.
 *   3. Only once step 1 finds zero conflicts: drop the tenant-scoped
 *      composite unique constraints, then add two functional unique indexes
 *      -- `UNIQUE (LOWER(username))` and `UNIQUE (LOWER(email))` -- which is
 *      how Postgres expresses case-insensitive uniqueness (there is no
 *      built-in case-insensitive `UNIQUE (col)` constraint; a plain
 *      `UNIQUE (username)` constraint would still allow `"Admin"` and
 *      `"admin"` to coexist, which is not the target invariant).
 *
 * This migration only makes the database CAPABLE of supporting
 * `AUTH_IDENTITY_MODE=global` -- it does not flip that flag anywhere, and it
 * does not touch `LOGIN_TENANT_SCOPE_MODE`, `TenantScopeGuard`, Host-header
 * resolution, Vendor Portal, or the frontend. Those remain later phases by
 * explicit instruction; production stays on `AUTH_IDENTITY_MODE=legacy`
 * until the rest of this migration is complete and validated.
 */
export class GlobalIdentityUniqueness1788500000000 implements MigrationInterface {
  name = 'GlobalIdentityUniqueness1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Step 1: pre-migration duplicate check, case-insensitive, global --
    const usernameDuplicates: { value_ci: string; count: string }[] = await queryRunner.query(`
      SELECT LOWER("username") AS value_ci, COUNT(*) AS count
      FROM "users"
      GROUP BY LOWER("username")
      HAVING COUNT(*) > 1;
    `);
    const emailDuplicates: { value_ci: string; count: string }[] = await queryRunner.query(`
      SELECT LOWER("email") AS value_ci, COUNT(*) AS count
      FROM "users"
      GROUP BY LOWER("email")
      HAVING COUNT(*) > 1;
    `);

    if (usernameDuplicates.length > 0 || emailDuplicates.length > 0) {
      const describe = (rows: { value_ci: string; count: string }[]) =>
        rows.map((r) => `"${r.value_ci}" (${r.count} rows)`).join(', ');
      throw new Error(
        `[GlobalIdentityUniqueness] Aborting -- found duplicate values that would violate global, case-insensitive ` +
        `uniqueness on users.username / users.email. No data has been changed. Resolve every conflict below by ` +
        `renaming or merging the affected user(s) so each value is unique across the ENTIRE database (not just ` +
        `within one tenant), then re-run this migration. Run "npm run verify:global-identity" for the full report ` +
        `(affected tenant + user IDs for every conflict). ` +
        `Duplicate usernames (case-insensitive): ${usernameDuplicates.length ? describe(usernameDuplicates) : 'none'}. ` +
        `Duplicate emails (case-insensitive): ${emailDuplicates.length ? describe(emailDuplicates) : 'none'}.`,
      );
    }

    // -- Step 2: drop the tenant-scoped composite unique constraints -------
    // (added by 1783880000000-TenantScopedIdentityCompositeConstraints.ts).
    // roles(tenant_id, name) is intentionally left untouched -- out of scope
    // for this phase, see this file's top doc comment.
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_tenant_username";`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_tenant_email";`);

    // -- Step 3: global, case-insensitive unique indexes -------------------
    // A functional unique index on LOWER(...) is the standard Postgres
    // pattern for case-insensitive uniqueness -- a plain UNIQUE(username)
    // constraint alone would still allow "Admin" and "admin" to coexist.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_username_ci" ON "users" (LOWER("username"));
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_email_ci" ON "users" (LOWER("email"));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverses cleanly and unconditionally: global uniqueness is strictly
    // STRONGER than tenant-scoped uniqueness, so any data satisfying the
    // global indexes above already satisfies the narrower composite
    // constraints being restored here -- unlike the forward direction, this
    // down() can never fail on a duplicate-data collision.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_email_ci";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_username_ci";`);

    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_tenant_email" UNIQUE ("tenant_id", "email");`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_tenant_username" UNIQUE ("tenant_id", "username");`);
  }
}
