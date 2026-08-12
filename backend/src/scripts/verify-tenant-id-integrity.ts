/**
 * Tenant-Scoped User Identity, Task 1 (Data Hygiene Precondition) —
 * pre-migration validation query. See
 * TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md, Task 1.
 *
 * Read-only. Makes no changes. Run this against a real environment BEFORE
 * running migrations that add tenant-scoped uniqueness (Task 2's
 * `hisEmployeeCode` index, Task 5's composite constraints), to see exactly
 * what `1783860000000-BackfillTenantIdDataHygiene.ts` is about to touch (or
 * confirm there's nothing to touch) ahead of time, rather than finding out
 * mid-migration.
 *
 * Also useful as a standing operational health check independent of any
 * migration -- a `tenant_id: NULL` row appearing on a database that should
 * already be fully backfilled means something upstream (a raw INSERT, a
 * restored backup predating the backfill, a manual `psql` session) bypassed
 * the application's tenant-stamping path, and is worth investigating on its
 * own even outside a migration window.
 *
 * Run: npm run verify:tenant-id
 * Exit code: 0 if no NULL tenant_id rows found in users/roles, 1 otherwise.
 */
import { AppDataSource } from '../database/data-source';

const TABLES = ['users', 'roles'] as const;

async function main() {
  await AppDataSource.initialize();

  try {
    let totalOffending = 0;

    for (const table of TABLES) {
      const [{ count }] = await AppDataSource.query(
        `SELECT COUNT(*) AS count FROM "${table}" WHERE "tenant_id" IS NULL;`,
      );
      const offending = Number(count);
      totalOffending += offending;

      if (offending === 0) {
        console.log(`✅ "${table}": no rows with NULL tenant_id.`);
        continue;
      }

      console.warn(`⚠️  "${table}": ${offending} row(s) with NULL tenant_id.`);

      // Show a bounded sample for triage -- not the full list, to avoid
      // flooding the console on a large legacy database.
      const identifyingColumn = table === 'users' ? 'username' : 'name';
      const sample = await AppDataSource.query(
        `SELECT "id", "${identifyingColumn}", "created_at"
         FROM "${table}"
         WHERE "tenant_id" IS NULL
         ORDER BY "created_at" ASC
         LIMIT 20;`,
      );
      console.warn(`    Sample (up to 20, oldest first):`);
      for (const row of sample) {
        console.warn(`      - id=${row.id} ${identifyingColumn}=${row[identifyingColumn]} created_at=${row.created_at}`);
      }
    }

    if (totalOffending > 0) {
      console.error(
        `\n❌ Found ${totalOffending} row(s) with NULL tenant_id across ${TABLES.join('/')}. ` +
        `Run migrations (1783860000000-BackfillTenantIdDataHygiene.ts backfills these to the ` +
        `'default' tenant automatically) before proceeding with any tenant-scoped uniqueness work.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`\n✅ All ${TABLES.join('/')} rows have a non-NULL tenant_id. Safe to proceed.`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Fatal error running verify-tenant-id-integrity:', err);
  process.exit(1);
});
