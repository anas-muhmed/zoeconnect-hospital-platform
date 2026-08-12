/**
 * Data repair (production incident, 2026-08) — read-only verification
 * companion to `1790800000000-RepairMisstampedFeedbackTenantId.ts`. See
 * that migration's doc comment, and `ChainTenantResolver`'s doc comment,
 * for the full root-cause writeup (public feedback submissions were
 * mis-stamped to the platform's seeded 'default' tenant instead of the
 * submitting hospital's real tenant).
 *
 * Read-only. Makes no changes. Run this:
 *   - BEFORE the repair migration, to see exactly how many rows across the
 *     feedback module are currently mis-stamped to 'default' (or, for
 *     feedback_notifications, left NULL) with a provable real tenant.
 *   - AFTER the repair migration, to confirm what (if anything) is left --
 *     some residue is EXPECTED and not itself a bug (see the migration's
 *     own "no unambiguous parent signal" case), but a nonzero count here
 *     post-repair is worth a human look, especially for a specific tenant
 *     a support ticket names.
 *   - As a standing operational health check independent of any migration
 *     -- a mis-stamped row appearing on a database that should already be
 *     fully repaired means the underlying bug (or a new one like it) is
 *     still live somewhere.
 *
 * Run: npm run verify:feedback-tenant-id
 * Exit code: 0 if nothing provably mis-stamped found, 1 otherwise
 * (informational only -- does not fail CI/deploys by default; not wired
 * into any automated gate).
 */
import { AppDataSource } from '../database/data-source';

interface CheckSpec {
  label: string;
  countSql: string;
  sampleSql: string;
}

async function main() {
  await AppDataSource.initialize();

  try {
    const defaultTenantRows = await AppDataSource.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (defaultTenantRows.length === 0) {
      console.log('No "default" tenant row found -- nothing to check (this script only looks for rows mis-stamped to it).');
      return;
    }
    const defaultTenantId: string = defaultTenantRows[0].id;

    const checks: CheckSpec[] = [
      {
        label: 'feedback_submissions (via qr_code_id -> feedback_qr_codes)',
        countSql: `SELECT COUNT(*) AS count FROM "feedback_submissions" fs
                    JOIN "feedback_qr_codes" qr ON fs.qr_code_id = qr.id
                    WHERE fs.tenant_id = $1 AND qr.tenant_id IS NOT NULL AND qr.tenant_id != $1`,
        sampleSql: `SELECT fs.id, fs.qr_code_id, qr.tenant_id AS correct_tenant_id, fs.submitted_at
                     FROM "feedback_submissions" fs
                     JOIN "feedback_qr_codes" qr ON fs.qr_code_id = qr.id
                     WHERE fs.tenant_id = $1 AND qr.tenant_id IS NOT NULL AND qr.tenant_id != $1
                     ORDER BY fs.submitted_at DESC LIMIT 20`,
      },
      {
        label: 'feedback_answers (via submission_id -> feedback_submissions)',
        countSql: `SELECT COUNT(*) AS count FROM "feedback_answers" fa
                    JOIN "feedback_submissions" fs ON fa.submission_id = fs.id
                    WHERE fa.tenant_id = $1 AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
        sampleSql: `SELECT fa.id, fa.submission_id, fs.tenant_id AS correct_tenant_id
                     FROM "feedback_answers" fa
                     JOIN "feedback_submissions" fs ON fa.submission_id = fs.id
                     WHERE fa.tenant_id = $1 AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1
                     LIMIT 20`,
      },
      {
        label: 'feedback_complaints (via submission_id -> feedback_submissions)',
        countSql: `SELECT COUNT(*) AS count FROM "feedback_complaints" fc
                    JOIN "feedback_submissions" fs ON fc.submission_id = fs.id
                    WHERE (fc.tenant_id = $1 OR fc.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
        sampleSql: `SELECT fc.id, fc.submission_id, fs.tenant_id AS correct_tenant_id, fc.created_at
                     FROM "feedback_complaints" fc
                     JOIN "feedback_submissions" fs ON fc.submission_id = fs.id
                     WHERE (fc.tenant_id = $1 OR fc.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1
                     ORDER BY fc.created_at DESC LIMIT 20`,
      },
      {
        label: "feedback_audit_logs (entity_type='feedback_submission')",
        countSql: `SELECT COUNT(*) AS count FROM "feedback_audit_logs" fal
                    JOIN "feedback_submissions" fs ON fal.entity_type = 'feedback_submission' AND fal.entity_id = fs.id::text
                    WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
        sampleSql: `SELECT fal.id, fal.entity_id, fs.tenant_id AS correct_tenant_id, fal.changed_at
                     FROM "feedback_audit_logs" fal
                     JOIN "feedback_submissions" fs ON fal.entity_type = 'feedback_submission' AND fal.entity_id = fs.id::text
                     WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1
                     ORDER BY fal.changed_at DESC LIMIT 20`,
      },
      {
        label: "feedback_audit_logs (entity_type='feedback_complaint')",
        countSql: `SELECT COUNT(*) AS count FROM "feedback_audit_logs" fal
                    JOIN "feedback_complaints" fc ON fal.entity_type = 'feedback_complaint' AND fal.entity_id = fc.id::text
                    WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1`,
        sampleSql: `SELECT fal.id, fal.entity_id, fc.tenant_id AS correct_tenant_id, fal.changed_at
                     FROM "feedback_audit_logs" fal
                     JOIN "feedback_complaints" fc ON fal.entity_type = 'feedback_complaint' AND fal.entity_id = fc.id::text
                     WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1
                     ORDER BY fal.changed_at DESC LIMIT 20`,
      },
      {
        label: 'feedback_notifications (via complaint_id -> feedback_complaints)',
        countSql: `SELECT COUNT(*) AS count FROM "feedback_notifications" fn
                    JOIN "feedback_complaints" fc ON fn.complaint_id = fc.id
                    WHERE (fn.tenant_id IS NULL OR fn.tenant_id = $1) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1`,
        sampleSql: `SELECT fn.id, fn.complaint_id, fc.tenant_id AS correct_tenant_id, fn.created_at
                     FROM "feedback_notifications" fn
                     JOIN "feedback_complaints" fc ON fn.complaint_id = fc.id
                     WHERE (fn.tenant_id IS NULL OR fn.tenant_id = $1) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1
                     ORDER BY fn.created_at DESC LIMIT 20`,
      },
    ];

    let totalOffending = 0;

    for (const check of checks) {
      const [{ count }] = await AppDataSource.query(check.countSql, [defaultTenantId]);
      const offending = Number(count);
      totalOffending += offending;

      if (offending === 0) {
        console.log(`✅ ${check.label}: no provably mis-stamped rows.`);
        continue;
      }

      console.warn(`⚠️  ${check.label}: ${offending} provably mis-stamped row(s).`);
      const sample = await AppDataSource.query(check.sampleSql, [defaultTenantId]);
      console.warn(`    Sample (up to 20):`);
      for (const row of sample) {
        console.warn(`      - ${JSON.stringify(row)}`);
      }
    }

    if (totalOffending > 0) {
      console.error(
        `\n❌ Found ${totalOffending} provably mis-stamped row(s) across the feedback module. Run migrations ` +
        `(1790800000000-RepairMisstampedFeedbackTenantId.ts repairs these automatically) to fix.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`\n✅ No provably mis-stamped feedback rows found.`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Fatal error running verify-feedback-tenant-id-integrity:', err);
  process.exit(1);
});
