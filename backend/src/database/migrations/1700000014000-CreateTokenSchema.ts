import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token Queue Management Schema
 *
 * token_counters — configurable billing counters (max 10, default 3)
 * token_calls    — immutable audit log of every token announced
 */
export class CreateTokenSchema1700000014000 implements MigrationInterface {
  name = 'CreateTokenSchema1700000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. token_counters ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_counters" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"         VARCHAR(20)  NOT NULL,           -- e.g. COUNTER_1
        "label"        VARCHAR(100) NOT NULL,           -- e.g. "Billing Counter 1"
        "current_token" INT         NULL,               -- last called token (null = idle)
        "is_active"    BOOLEAN      NOT NULL DEFAULT TRUE,
        "display_order" INT         NOT NULL DEFAULT 0,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_counters" PRIMARY KEY ("id"),
        CONSTRAINT "uq_token_counters_code" UNIQUE ("code")
      )
    `);

    // ── 2. token_calls (audit log) ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "token_calls" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "counter_id"  UUID         NOT NULL,
        "token_number" INT         NOT NULL,
        "called_by"   UUID         NOT NULL,            -- user.id
        "called_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_token_calls" PRIMARY KEY ("id"),
        CONSTRAINT "fk_token_calls_counter"
          FOREIGN KEY ("counter_id") REFERENCES "token_counters"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_token_calls_counter_date"
        ON "token_calls" ("counter_id", "called_at" DESC)
    `);

    // ── 3. Seed default counters ───────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "token_counters" ("code","label","display_order") VALUES
        ('COUNTER_1','Billing Counter 1', 1),
        ('COUNTER_2','Billing Counter 2', 2),
        ('COUNTER_3','Billing Counter 3', 3)
      ON CONFLICT ("code") DO NOTHING
    `);

    // ── 4. module_registry entry (must exist before roles FK) ────────────────
    await queryRunner.query(`
      INSERT INTO "module_registry"
        ("code","name","route","version","is_active","license_required","display_order","description")
      VALUES
        ('TOKEN','Token Queue','token','1.0.0',TRUE,FALSE,8,'Hospital billing counter token management')
      ON CONFLICT ("code") DO NOTHING
    `);

    // ── 5. TOKEN permissions ───────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description") VALUES
        ('TOKEN','COUNTER','OPERATE', 'Call tokens from a counter'),
        ('TOKEN','COUNTER','READ',    'View counter state'),
        ('TOKEN','DISPLAY','VIEW',    'View the token display board'),
        ('TOKEN','COUNTER','MANAGE',  'Create/edit counters (admin)')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    // ── 6. TOKEN_OPERATOR role ─────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "roles" ("name","description","is_system","module_code")
      VALUES ('TOKEN_OPERATOR','Token queue operator — calls tokens at a billing counter', FALSE, 'TOKEN')
      ON CONFLICT ("name") DO NOTHING
    `);

    // ── 7. Assign permissions to roles ────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles" r
      CROSS JOIN "permissions" p
      WHERE  r.name = 'TOKEN_OPERATOR'
        AND  p.module_code = 'TOKEN'
        AND  p.action IN ('OPERATE','READ','VIEW')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles" r
      CROSS JOIN "permissions" p
      WHERE  r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
        AND  p.module_code = 'TOKEN'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "token_calls"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "token_counters"`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "module_code" = 'TOKEN'`);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'TOKEN_OPERATOR'`);
    await queryRunner.query(`DELETE FROM "module_registry" WHERE "code" = 'TOKEN'`);
  }
}
