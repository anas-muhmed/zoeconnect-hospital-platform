/**
 * ZoeConnect Identity Architecture Migration, Phase 4 (pre-migration
 * validation) -- read-only. Makes no changes, renames nothing, merges
 * nothing.
 *
 * Scans the entire `users` table for duplicate `username` and duplicate
 * `email` values, CASE-INSENSITIVELY, ACROSS ALL TENANTS -- i.e. the exact
 * invariant `1788500000000-GlobalIdentityUniqueness.ts`'s migration is about
 * to enforce at the database level. Run this against a real environment
 * BEFORE running that migration, to see exactly what (if anything) needs to
 * be corrected first, with full detail (affected tenant, affected user IDs)
 * rather than the migration's own necessarily-terser abort message.
 *
 * This script and the migration's own pre-check run the identical
 * `LOWER(...)` grouping query -- kept in sync deliberately (see the
 * migration file's doc comment) so "this script reports clean" and "the
 * migration will proceed" are always the same fact, never two different
 * queries that could quietly drift apart.
 *
 * Run: npm run verify:global-identity
 * Exit code: 0 if zero duplicates found, 1 otherwise.
 */
import { AppDataSource } from '../database/data-source';

interface DuplicateGroup {
  value_ci: string;
  count: string;
}

interface AffectedUserRow {
  id: string;
  username: string;
  email: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_code: string | null;
}

async function reportDuplicates(field: 'username' | 'email'): Promise<number> {
  const groups: DuplicateGroup[] = await AppDataSource.query(`
    SELECT LOWER("${field}") AS value_ci, COUNT(*) AS count
    FROM "users"
    GROUP BY LOWER("${field}")
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, value_ci ASC;
  `);

  if (groups.length === 0) {
    console.log(`✅ "${field}": no case-insensitive duplicates across any tenant.`);
    return 0;
  }

  console.warn(`⚠️  "${field}": ${groups.length} value(s) shared across more than one row (case-insensitive):`);

  for (const group of groups) {
    const affected: AffectedUserRow[] = await AppDataSource.query(
      `
        SELECT u."id", u."username", u."email", u."tenant_id", t."name" AS tenant_name, t."code" AS tenant_code
        FROM "users" u
        LEFT JOIN "tenant" t ON t."id" = u."tenant_id"
        WHERE LOWER(u."${field}") = $1
        ORDER BY t."name" ASC, u."created_at" ASC;
      `,
      [group.value_ci],
    );

    console.warn(`\n    "${field}" = "${group.value_ci}" (${group.count} row(s)):`);
    for (const row of affected) {
      console.warn(
        `      - user.id=${row.id} username=${row.username} email=${row.email} ` +
        `tenant=${row.tenant_name ?? '(unknown)'} (code=${row.tenant_code ?? '?'}, tenant_id=${row.tenant_id})`,
      );
    }
  }

  return groups.length;
}

async function main() {
  await AppDataSource.initialize();

  try {
    const usernameGroupCount = await reportDuplicates('username');
    const emailGroupCount = await reportDuplicates('email');
    const totalGroups = usernameGroupCount + emailGroupCount;

    if (totalGroups > 0) {
      console.error(
        `\n❌ Found ${usernameGroupCount} duplicate username value(s) and ${emailGroupCount} duplicate email ` +
        `value(s) across tenants (case-insensitive). Global uniqueness cannot be enforced until every group above ` +
        `is resolved manually -- rename or merge the affected user(s) so each value is unique account-wide, then ` +
        `re-run this script. Nothing has been changed by this script; ` +
        `1788500000000-GlobalIdentityUniqueness.ts will refuse to run while any duplicates remain.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `\n✅ No duplicate usernames or emails found across any tenant. Safe to run ` +
        `1788500000000-GlobalIdentityUniqueness.ts.`,
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Fatal error running verify-global-identity-uniqueness:', err);
  process.exit(1);
});
