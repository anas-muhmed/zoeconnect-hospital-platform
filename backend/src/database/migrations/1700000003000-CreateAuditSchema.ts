import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 003 — Audit Schema
 * Creates: audit_logs (partitioned by month)
 *
 * NOTE: PostgreSQL declarative partitioning requires the parent table
 * to be declared PARTITION BY before child partitions are created.
 * TypeORM does not manage partitions — create them via the cron job
 * scripts/create-audit-partitions.sql (run monthly by DBA).
 */
export class CreateAuditSchema1700000003000 implements MigrationInterface {
  name = 'CreateAuditSchema1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── audit_logs (partitioned parent) ───────────────────────────
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"          BIGSERIAL    NOT NULL,
        "user_id"     UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        "action"      VARCHAR(100) NOT NULL,
        "module"      VARCHAR(50)  NOT NULL,
        "entity_type" VARCHAR(100),
        "entity_id"   VARCHAR(100),
        "old_value"   JSONB,
        "new_value"   JSONB,
        "ip_address"  INET,
        "user_agent"  VARCHAR(500),
        "request_id"  UUID,
        "metadata"    JSONB,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      ) PARTITION BY RANGE ("created_at")
    `);

    // ── Create initial partitions (current + next 2 months) ──────
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const suffix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
      const from = d.toISOString().split('T')[0];
      const to = next.toISOString().split('T')[0];
      await queryRunner.query(`
        CREATE TABLE "audit_logs_${suffix}"
          PARTITION OF "audit_logs"
          FOR VALUES FROM ('${from}') TO ('${to}')
      `);
    }

    // ── Indexes (on parent — propagate to all partitions) ────────
    await queryRunner.query(`
      CREATE INDEX "idx_audit_user_date"
        ON "audit_logs"("user_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_entity"
        ON "audit_logs"("entity_type", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_action"
        ON "audit_logs"("action", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_module"
        ON "audit_logs"("module", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
  }
}
