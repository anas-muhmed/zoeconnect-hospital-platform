import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A12).
 *
 * Adds a nullable `tenant_id` to the 14 remaining Feedback tables (forms,
 * sections, questions, options, conditions, campaigns, QR codes,
 * submissions, answers, complaints, languages, translations,
 * notifications, audit trail), backfilling every existing row to the
 * seeded 'default' tenant (looked up by `code` — see Checkpoint A1-A5,
 * A7-A9, A11). `feedback_settings` already has a `tenant_id` column from
 * Checkpoint A2 and was contract-audited in A5.5 (explicit `select`
 * projection excluding tenantId) — not touched here.
 *
 * Row-count check before this migration (real environment):
 *   feedback_submissions       22
 *   feedback_answers           47
 *   feedback_audit_logs       191
 *   feedback_notifications      7
 * All comfortably under the 100k separate-migration threshold established
 * at A5/A7/A8/A9/A11. A single migration covers all 14 tables.
 *
 * Relationship audit: no External Ownership Pattern found (contrast with
 * A9/Attendance) — every table's ownership resolves via a direct
 * branch_id column or an internal Postgres FK join back to
 * feedback_forms or feedback_campaigns.
 *
 * The one genuinely new risk class in this checkpoint: FeedbackSubmission,
 * FeedbackAnswer, and (on its initial create path) FeedbackComplaint are
 * written from FeedbackPublicController, the first fully unauthenticated,
 * unguarded (no @UseGuards) controller encountered in this migration —
 * public QR-scan → form-fill traffic with zero user/session context
 * ('changed_by' is literally the string 'public' in the audit trail for
 * these events). Stage A's blanket 'default' backfill is unaffected by
 * this (it only touches existing rows), but Stage B's write-path tenant
 * resolution for these three tables cannot be sourced from a
 * request-scoped user/session the way every other checkpoint's write
 * paths can — it must be derived server-side from the resolved
 * QR → campaign → branch chain and never trusted from client input.
 *
 * feedback_languages is deliberately global today (shared language pool
 * across hospitals, per its own doc comment) — classified Shared-global,
 * not Tenant-owned; whether it should ever get a load-bearing tenant_id
 * is an open Stage B architectural question, not resolved by this
 * migration adding the column for schema consistency.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B. Also deferred:
 * admin controllers return raw entities without projection (same as
 * every prior checkpoint pre-tenant_id); the public GET endpoint embeds
 * unprojected nested entity trees (sections/questions/options) — both
 * will need A5.5-style explicit-select treatment once tenant_id is
 * load-bearing, tracked as checkpoint A12.5.
 */
export class AddTenantIdToFeedbackTables1783800000000 implements MigrationInterface {
  name = 'AddTenantIdToFeedbackTables1783800000000';

  private readonly tables = [
    'feedback_forms',
    'feedback_sections',
    'feedback_questions',
    'feedback_question_options',
    'feedback_question_conditions',
    'feedback_campaigns',
    'feedback_qr_codes',
    'feedback_submissions',
    'feedback_answers',
    'feedback_complaints',
    'feedback_languages',
    'feedback_translations',
    'feedback_notifications',
    'feedback_audit_logs',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
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
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
