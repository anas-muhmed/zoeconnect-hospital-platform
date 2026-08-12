import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant-Scoped User Identity, Task 2 (`hisEmployeeCode` uniqueness).
 *
 * See TENANT_SCOPED_IDENTITY_AUDIT.md and
 * TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md — Task 2.
 *
 * Why this exists: `users.his_employee_code` (added by
 * `1751140000000-AddHisEmployeeMapping.ts`) has never had ANY uniqueness
 * constraint, tenant-scoped or global. It backs a live auto-login path
 * (`AuthService.hisLogin()` -> `UsersService.findByHisEmployeeCode()`), so
 * two users in the same tenant sharing a HIS employee code isn't just a
 * data-quality nit -- it's a live "which account do I land in" ambiguity.
 * This was the single most severe finding in the identity audit.
 *
 * Sequenced strictly after Task 1 (`1783860000000-BackfillTenantIdDataHygiene.ts`):
 * Postgres treats every NULL as distinct in a unique index, so a stray
 * `tenant_id: NULL` row would silently defeat this partial index the same
 * way it would Task 5's composite constraints -- Task 1 already guarantees
 * zero NULL-tenant rows in `users` by the time this migration runs.
 *
 * Partial (`WHERE his_employee_code IS NOT NULL`), not a plain composite
 * unique index, since the column is nullable and most users have no HIS
 * mapping at all -- a plain unique index would incorrectly treat every
 * NULL-code user as a duplicate-in-waiting the moment a second one existed
 * (Postgres unique indexes DO still enforce uniqueness across explicit NULLs
 * being compared to each other only when NOT using partial -- to avoid ANY
 * ambiguity here we scope the index to rows that actually carry a code).
 */
export class AddHisEmployeeCodeTenantScopedIndex1783870000000 implements MigrationInterface {
  name = 'AddHisEmployeeCodeTenantScopedIndex1783870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-migration duplicate check (same shape as Task 1's). If any tenant
    // already has two-or-more active/inactive users sharing a
    // his_employee_code today -- entirely possible, since nothing has ever
    // prevented it -- creating the unique index below would fail outright.
    // Surface exactly which (tenant_id, his_employee_code) pairs collide so
    // an operator can resolve them manually before re-running migrations,
    // rather than failing with a bare Postgres constraint-violation error.
    const duplicates = await queryRunner.query(`
      SELECT "tenant_id", "his_employee_code", COUNT(*) AS count
      FROM "users"
      WHERE "his_employee_code" IS NOT NULL
      GROUP BY "tenant_id", "his_employee_code"
      HAVING COUNT(*) > 1;
    `);

    if (duplicates.length > 0) {
      const details = duplicates
        .map((d: { tenant_id: string; his_employee_code: string; count: string }) =>
          `tenant_id=${d.tenant_id} his_employee_code=${d.his_employee_code} (${d.count} users)`)
        .join('; ');
      throw new Error(
        `[AddHisEmployeeCodeTenantScopedIndex] Found ${duplicates.length} (tenant_id, his_employee_code) ` +
        `pair(s) with duplicate active mappings, which would violate the new unique index: ${details}. ` +
        `Resolve these manually (reassign or clear the duplicate his_employee_code values) before re-running ` +
        `this migration -- see TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md, Task 2.`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_tenant_his_employee_code"
      ON "users" ("tenant_id", "his_employee_code")
      WHERE "his_employee_code" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_tenant_his_employee_code";`);
  }
}
