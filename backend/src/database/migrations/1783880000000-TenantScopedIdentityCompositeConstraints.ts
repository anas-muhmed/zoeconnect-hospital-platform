import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-Scoped User Identity, Task 5 (composite unique constraints +
 * `tenant_id NOT NULL`).
 *
 * See TENANT_SCOPED_IDENTITY_AUDIT.md and
 * TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md — Task 5.
 *
 * Sequenced strictly after Tasks 1, 2, 3 (this repo's locked task order:
 * 1 -> 2 -> 4 -> 6 -> 3 -> 5 -> 7 -> 9 -> 8 -> 10): by the time this lands,
 * `1783860000000-BackfillTenantIdDataHygiene.ts` (Task 1) has already
 * guaranteed zero `NULL`-tenant rows in `users`/`roles`, and
 * `AuthService.login()` (Task 3) is already tenant-aware in front of this
 * change (via `LOGIN_TENANT_SCOPE_MODE`), so tightening `username`/`email`/
 * `Role.name` from globally-unique to tenant-scoped-unique can no longer
 * silently break login.
 *
 * What this does, in order:
 *   1. Pre-migration duplicate check across (tenant_id, username),
 *      (tenant_id, email), and (tenant_id, name) -- logically redundant
 *      today (the OLD constraints were already single-column globally
 *      unique, so no two rows can share a (tenant_id, username) pair any
 *      more than they could share a bare username), but kept as a real,
 *      executed safety net rather than an assumption -- matches every
 *      other uniqueness migration in this identity work (Task 1, Task 2)
 *      and catches the case where the old constraints were ever dropped or
 *      bypassed out-of-band.
 *   2. Defensive re-verification that no `NULL` `tenant_id` remains in
 *      either table -- Task 1 already guarantees this in the intended run
 *      order, but this migration doesn't blindly trust that order was
 *      followed; it fails loudly and directs the operator to run Task 1's
 *      migration first, rather than let Postgres reject the `SET NOT NULL`
 *      below with a less actionable error.
 *   3. Drop the old single-column unique constraints (`uq_users_username`,
 *      `uq_users_email`, `uq_roles_name` -- hand-named in the original
 *      `1700000001000-CreatePlatformSchema.ts`, not TypeORM-hash-generated).
 *   4. `ALTER COLUMN "tenant_id" SET NOT NULL` on both tables.
 *   5. Add the new composite unique constraints: `uq_users_tenant_username`
 *      `UNIQUE (tenant_id, username)`, `uq_users_tenant_email`
 *      `UNIQUE (tenant_id, email)`, `uq_roles_tenant_name`
 *      `UNIQUE (tenant_id, name)`. Email is tenant-scoped here, not kept
 *      global -- confirmed decision, see the plan's "Decisions locked" #6.
 *
 * Companion code changes shipped in this same pass (not part of this
 * migration file, but required for it to be safe): `seed-platform.ts`'s
 * `ON CONFLICT ("username")` / `ON CONFLICT ("name")` raw SQL updated to
 * name the new composite constraint's columns exactly (Postgres requires an
 * exact column-list match for `ON CONFLICT` targets); `User`/`Role` entity
 * `tenantId` columns changed from `nullable: true` to `nullable: false`;
 * three write paths that previously could insert a `NULL` `tenant_id`
 * (`AuthService.setupSuperAdmin()`'s "null-vs-default equivalence",
 * `UsersService.create()`, `RolesService.create()`) fixed to always stamp a
 * real tenant UUID; `HisConfigService.applyHdspUsers()` (the one caller
 * with genuinely no tenant context available today -- its webhook payload
 * has no tenant field at all, which is Task 8's scope, not this one's)
 * given a narrowly-scoped bridge that stamps the seeded 'default' tenant on
 * new-user inserts, flagged inline as a placeholder pending Task 8.
 */
export class TenantScopedIdentityCompositeConstraints1783880000000 implements MigrationInterface {
  name = 'TenantScopedIdentityCompositeConstraints1783880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -- Step 1: pre-migration duplicate check ---------------------------
    const userDuplicates = await queryRunner.query(`
      SELECT "tenant_id", "username", COUNT(*) AS count
      FROM "users"
      GROUP BY "tenant_id", "username"
      HAVING COUNT(*) > 1;
    `);
    const emailDuplicates = await queryRunner.query(`
      SELECT "tenant_id", "email", COUNT(*) AS count
      FROM "users"
      GROUP BY "tenant_id", "email"
      HAVING COUNT(*) > 1;
    `);
    const roleDuplicates = await queryRunner.query(`
      SELECT "tenant_id", "name", COUNT(*) AS count
      FROM "roles"
      GROUP BY "tenant_id", "name"
      HAVING COUNT(*) > 1;
    `);

    if (userDuplicates.length > 0 || emailDuplicates.length > 0 || roleDuplicates.length > 0) {
      const describe = (rows: Record<string, string>[], cols: string[]) =>
        rows.map((r) => `(${cols.map((c) => `${c}=${r[c]}`).join(', ')}, count=${r.count})`).join('; ');
      throw new Error(
        `[TenantScopedIdentityCompositeConstraints] Found duplicate rows that would violate the new composite ` +
        `unique constraints -- resolve manually before re-running this migration. ` +
        `users(tenant_id, username): ${userDuplicates.length ? describe(userDuplicates, ['tenant_id', 'username']) : 'none'}. ` +
        `users(tenant_id, email): ${emailDuplicates.length ? describe(emailDuplicates, ['tenant_id', 'email']) : 'none'}. ` +
        `roles(tenant_id, name): ${roleDuplicates.length ? describe(roleDuplicates, ['tenant_id', 'name']) : 'none'}. ` +
        `See TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md, Task 5.`,
      );
    }

    // -- Step 2: defensive re-verification of Task 1's precondition ------
    for (const table of ['users', 'roles']) {
      const [{ remaining }] = await queryRunner.query(
        `SELECT COUNT(*) AS remaining FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      if (Number(remaining) > 0) {
        throw new Error(
          `[TenantScopedIdentityCompositeConstraints] "${table}" has ${remaining} row(s) with NULL tenant_id -- ` +
          `run 1783860000000-BackfillTenantIdDataHygiene.ts (Task 1) first. Aborting migration.`,
        );
      }
    }

    // -- Step 3: drop old single-column unique constraints ----------------
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_username";`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_email";`);
    await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT "uq_roles_name";`);

    // -- Step 4: tenant_id NOT NULL ----------------------------------------
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "tenant_id" SET NOT NULL;`);

    // -- Step 5: new composite unique constraints --------------------------
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_tenant_username" UNIQUE ("tenant_id", "username");`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_tenant_email" UNIQUE ("tenant_id", "email");`);
    await queryRunner.query(`ALTER TABLE "roles" ADD CONSTRAINT "uq_roles_tenant_name" UNIQUE ("tenant_id", "name");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverses cleanly PROVIDED no data now depends on the composite
    // constraint's wider allowance (e.g. two tenants both using
    // "admin@hospital.local" as a user's email) -- if such rows exist,
    // re-adding the old single-column global unique constraints below will
    // fail with a standard Postgres constraint-violation error, which is
    // the correct, safe failure mode: this down() must not silently drop
    // data or pick a winner between two now-colliding rows.
    await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT "uq_roles_tenant_name";`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_tenant_email";`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_tenant_username";`);

    await queryRunner.query(`ALTER TABLE "roles" ALTER COLUMN "tenant_id" DROP NOT NULL;`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;`);

    await queryRunner.query(`ALTER TABLE "roles" ADD CONSTRAINT "uq_roles_name" UNIQUE ("name");`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_email" UNIQUE ("email");`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_username" UNIQUE ("username");`);
  }
}
