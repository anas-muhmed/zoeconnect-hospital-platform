import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant Foundation (Phase 1 — Hybrid Architecture roadmap, Checkpoint A5).
 *
 * Adds a nullable `tenant_id` to audit_logs, notification_logs, and
 * notification_templates, backfilling every existing row to the seeded
 * 'default' tenant (looked up by `code` — see Checkpoint A1/A2/A3/A4).
 *
 * Row-count check before this migration: audit_logs had 96 rows in the
 * verified environment — a single-statement backfill is appropriate; no
 * batching required. audit_logs is written to via 88 `@Audit(...)` call
 * sites plus 45 direct AuditService calls with no retention/cleanup job,
 * so it is the table in this batch most likely to warrant a batched
 * backfill in a live, long-running production deployment — noted for
 * awareness when this migration set is eventually run against a real
 * customer database, not a concern for this checkpoint's environment.
 *
 * Not NOT NULL, not a foreign key — deferred to Stage B (see Deferred
 * Work in the implementation report). `notification_templates` becomes
 * part of the default tenant after this one-time backfill, same as every
 * other table in Stage A. Future tenant filtering of audit_logs and
 * notification_logs is expected to be a plain `WHERE tenant_id = ...`
 * predicate once Task 1.6/1.7 exists — no schema redesign anticipated.
 */
export class AddTenantIdToAuditNotificationTables1783750000000 implements MigrationInterface {
  name = 'AddTenantIdToAuditNotificationTables1783750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['audit_logs', 'notification_logs', 'notification_templates'];

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
    const tables = ['audit_logs', 'notification_logs', 'notification_templates'];

    for (const table of tables) {
      await queryRunner.query(`DROP INDEX "IDX_${table}_tenant_id";`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "tenant_id";`);
    }
  }
}
