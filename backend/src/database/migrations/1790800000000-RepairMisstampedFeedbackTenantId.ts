import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data repair (production incident, 2026-08): companion migration to the
 * `FeedbackPublicService.submit()` / `FeedbackComplaintService
 * .submitPublic()` fix (see `ChainTenantResolver`'s doc comment for the
 * full root-cause writeup). Before that fix, EVERY public feedback
 * submission for EVERY cloud tenant was written with `tenant_id` = the
 * platform's single seeded 'default' tenant instead of the submitting
 * hospital's real tenant — making those submissions permanently invisible
 * on the real tenant's own admin Responses page (which reads through a
 * tenant-scoped repository keyed off the admin's own JWT tenantId).
 *
 * This migration repairs EXISTING rows written by the old, broken code
 * path. It is deliberately conservative: it only touches a row where the
 * correct tenant can be proven unambiguously via a join back to a parent
 * record that was NOT affected by the bug (an authenticated-write entity
 * whose own `tenant_id` was always stamped correctly). It will NOT touch:
 *   - a submission whose QR code also has `tenant_id` = 'default' or NULL
 *     (can't tell whether that submission genuinely belongs to the
 *     'default' tenant, or is mis-stamped and simply unrecoverable this
 *     way) -- e.g. self-hosted's own 'default'-tenant environment, where
 *     'default' IS the real, correct answer and must be left alone.
 *   - any row whose parent chain doesn't resolve unambiguously for any
 *     other reason.
 * Rows left untouched are logged (bounded sample) for manual/operator
 * review -- this migration does not throw on their existence, unlike
 * `1783860000000-BackfillTenantIdDataHygiene.ts`'s NULL-tenant backfill,
 * because "some rows remain unrepaired" is an accepted, expected outcome
 * here, not a failure condition.
 *
 * Repaired in strict dependency order, each step only usable once its
 * parent has already been corrected in an earlier step of this same
 * migration (Postgres sees each step's own prior UPDATE within the same
 * transaction):
 *   1. feedback_submissions  <- feedback_qr_codes (qr_code_id)
 *   2. feedback_answers      <- feedback_submissions (submission_id)
 *   3. feedback_complaints   <- feedback_submissions (submission_id)
 *   4. feedback_audit_logs   <- feedback_submissions (entity_type='feedback_submission', entity_id)
 *   5. feedback_audit_logs   <- feedback_complaints  (entity_type='feedback_complaint', entity_id)
 *   6. feedback_notifications <- feedback_complaints (complaint_id) -- these
 *      were left NULL (not mis-stamped to 'default'), a related but
 *      distinct gap fixed alongside the same incident (see
 *      FeedbackNotificationService.create()'s doc comment) -- repaired
 *      here too for a fully consistent dataset across the module.
 */
export class RepairMisstampedFeedbackTenantId1790800000000 implements MigrationInterface {
  name = 'RepairMisstampedFeedbackTenantId1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const defaultTenantResult = await queryRunner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (defaultTenantResult.length === 0) {
      console.log(
        '[RepairMisstampedFeedbackTenantId] No "default" tenant row found -- nothing to repair (this migration only ' +
        'targets rows mis-stamped to the seeded default tenant).',
      );
      return;
    }
    const defaultTenantId: string = defaultTenantResult[0].id;

    // ── Step 1: feedback_submissions <- feedback_qr_codes ──────────────
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_submissions" fs
       JOIN "feedback_qr_codes" qr ON fs.qr_code_id = qr.id
       WHERE fs.tenant_id = $1 AND qr.tenant_id IS NOT NULL AND qr.tenant_id != $1`,
      [defaultTenantId],
      'feedback_submissions (via qr_code_id -> feedback_qr_codes)',
    );
    await queryRunner.query(
      `UPDATE "feedback_submissions" fs
       SET "tenant_id" = qr.tenant_id
       FROM "feedback_qr_codes" qr
       WHERE fs.qr_code_id = qr.id
         AND fs.tenant_id = $1
         AND qr.tenant_id IS NOT NULL
         AND qr.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Step 2: feedback_answers <- feedback_submissions (now repaired) ─
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_answers" fa
       JOIN "feedback_submissions" fs ON fa.submission_id = fs.id
       WHERE fa.tenant_id = $1 AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
      [defaultTenantId],
      'feedback_answers (via submission_id -> feedback_submissions)',
    );
    await queryRunner.query(
      `UPDATE "feedback_answers" fa
       SET "tenant_id" = fs.tenant_id
       FROM "feedback_submissions" fs
       WHERE fa.submission_id = fs.id
         AND fa.tenant_id = $1
         AND fs.tenant_id IS NOT NULL
         AND fs.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Step 3: feedback_complaints <- feedback_submissions ─────────────
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_complaints" fc
       JOIN "feedback_submissions" fs ON fc.submission_id = fs.id
       WHERE (fc.tenant_id = $1 OR fc.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
      [defaultTenantId],
      'feedback_complaints (via submission_id -> feedback_submissions)',
    );
    await queryRunner.query(
      `UPDATE "feedback_complaints" fc
       SET "tenant_id" = fs.tenant_id
       FROM "feedback_submissions" fs
       WHERE fc.submission_id = fs.id
         AND (fc.tenant_id = $1 OR fc.tenant_id IS NULL)
         AND fs.tenant_id IS NOT NULL
         AND fs.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Step 4: feedback_audit_logs <- feedback_submissions ─────────────
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_audit_logs" fal
       JOIN "feedback_submissions" fs ON fal.entity_type = 'feedback_submission' AND fal.entity_id = fs.id::text
       WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fs.tenant_id IS NOT NULL AND fs.tenant_id != $1`,
      [defaultTenantId],
      "feedback_audit_logs (entity_type='feedback_submission', via entity_id -> feedback_submissions)",
    );
    await queryRunner.query(
      `UPDATE "feedback_audit_logs" fal
       SET "tenant_id" = fs.tenant_id
       FROM "feedback_submissions" fs
       WHERE fal.entity_type = 'feedback_submission'
         AND fal.entity_id = fs.id::text
         AND (fal.tenant_id = $1 OR fal.tenant_id IS NULL)
         AND fs.tenant_id IS NOT NULL
         AND fs.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Step 5: feedback_audit_logs <- feedback_complaints ──────────────
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_audit_logs" fal
       JOIN "feedback_complaints" fc ON fal.entity_type = 'feedback_complaint' AND fal.entity_id = fc.id::text
       WHERE (fal.tenant_id = $1 OR fal.tenant_id IS NULL) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1`,
      [defaultTenantId],
      "feedback_audit_logs (entity_type='feedback_complaint', via entity_id -> feedback_complaints)",
    );
    await queryRunner.query(
      `UPDATE "feedback_audit_logs" fal
       SET "tenant_id" = fc.tenant_id
       FROM "feedback_complaints" fc
       WHERE fal.entity_type = 'feedback_complaint'
         AND fal.entity_id = fc.id::text
         AND (fal.tenant_id = $1 OR fal.tenant_id IS NULL)
         AND fc.tenant_id IS NOT NULL
         AND fc.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Step 6: feedback_notifications <- feedback_complaints ───────────
    // These were left NULL (not mis-stamped to 'default') by the pre-fix
    // FeedbackNotificationService.create() call, which had no admin
    // session to read tenant from during a public-triggered complaint --
    // a related but distinct gap, repaired here for full consistency.
    await this._logCount(
      queryRunner,
      `SELECT COUNT(*) AS count FROM "feedback_notifications" fn
       JOIN "feedback_complaints" fc ON fn.complaint_id = fc.id
       WHERE (fn.tenant_id IS NULL OR fn.tenant_id = $1) AND fc.tenant_id IS NOT NULL AND fc.tenant_id != $1`,
      [defaultTenantId],
      'feedback_notifications (via complaint_id -> feedback_complaints)',
    );
    await queryRunner.query(
      `UPDATE "feedback_notifications" fn
       SET "tenant_id" = fc.tenant_id
       FROM "feedback_complaints" fc
       WHERE fn.complaint_id = fc.id
         AND (fn.tenant_id IS NULL OR fn.tenant_id = $1)
         AND fc.tenant_id IS NOT NULL
         AND fc.tenant_id != $1`,
      [defaultTenantId],
    );

    // ── Final visibility: how many feedback_submissions rows are still
    // stamped to 'default' but COULD NOT be proven one way or the other
    // (either genuinely belong to the default/self-hosted tenant, or are
    // mis-stamped with no recoverable signal left -- e.g. qr_code_id is
    // NULL, or the QR row itself was also affected). Logged for manual
    // review, never thrown -- this is an expected, accepted residue of a
    // deliberately conservative repair.
    const remaining = await queryRunner.query(
      `SELECT fs.id, fs.qr_code_id, fs.submitted_at
       FROM "feedback_submissions" fs
       LEFT JOIN "feedback_qr_codes" qr ON fs.qr_code_id = qr.id
       WHERE fs.tenant_id = $1
         AND (fs.qr_code_id IS NULL OR qr.tenant_id IS NULL OR qr.tenant_id = $1)
       ORDER BY fs.submitted_at DESC
       LIMIT 20`,
      [defaultTenantId],
    );
    if (remaining.length > 0) {
      console.log(
        `[RepairMisstampedFeedbackTenantId] ${remaining.length} (showing up to 20, most recent first) ` +
        `feedback_submissions row(s) remain stamped to the 'default' tenant with no unambiguous parent signal to ` +
        `repair from -- may genuinely belong to the default/self-hosted tenant, or may need manual investigation:`,
      );
      for (const row of remaining) {
        console.log(`    - id=${row.id} qr_code_id=${row.qr_code_id ?? 'NULL'} submitted_at=${row.submitted_at}`);
      }
    }
  }

  private async _logCount(queryRunner: QueryRunner, sql: string, params: unknown[], label: string): Promise<void> {
    const [{ count }] = await queryRunner.query(sql, params);
    if (Number(count) > 0) {
      console.log(`[RepairMisstampedFeedbackTenantId] ${label}: repairing ${count} row(s).`);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately a no-op -- same reasoning as
    // 1783860000000-BackfillTenantIdDataHygiene.ts's down(): this is a
    // lossy, one-directional data repair with no record of each row's
    // prior (wrong) value, and by the time this migration has run, real
    // application traffic may already depend on the corrected tenant_id
    // values (e.g. the repaired hospital's admin now sees and has acted on
    // these submissions). "Reverting" would only reopen the exact
    // visibility bug this migration exists to fix.
  }
}
