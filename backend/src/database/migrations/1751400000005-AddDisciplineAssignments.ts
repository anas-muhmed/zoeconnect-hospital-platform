import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisciplineAssignments1751400000005 implements MigrationInterface {
  name = 'AddDisciplineAssignments1751400000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enum types ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."assignment_role_enum" AS ENUM ('PRIMARY', 'COVERING', 'SUPERVISOR')
    `);

    // ── 2. Discipline assignments table ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "eic_enrollment_discipline_assignments" (
        "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
        "enrollment_id"     UUID          NOT NULL,
        "discipline"        "public"."eic_discipline" NOT NULL,
        "therapist_id"      UUID          NOT NULL,
        "role"              "public"."assignment_role_enum" NOT NULL DEFAULT 'PRIMARY',
        "assignment_reason" VARCHAR(500),
        "effective_from"    DATE          NOT NULL,
        "effective_to"      DATE,
        "is_active"         BOOLEAN       NOT NULL DEFAULT true,
        "assigned_by"       UUID          NOT NULL,
        "version"           INTEGER       NOT NULL DEFAULT 1,
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_eic_enrollment_discipline_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_eda_enrollment"
          FOREIGN KEY ("enrollment_id")
          REFERENCES "eic_therapy_enrollments" ("id")
          ON DELETE CASCADE
      )
    `);

    // ── 3. Indexes ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX "idx_eda_enrollment_discipline_active"
        ON "eic_enrollment_discipline_assignments" ("enrollment_id", "discipline", "is_active")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_eda_therapist_active"
        ON "eic_enrollment_discipline_assignments" ("therapist_id", "is_active")
    `);

    // ── 4. Add due-date columns to progress reports ───────────────────────────
    await queryRunner.query(`
      ALTER TABLE "eic_progress_reports"
        ADD COLUMN "sections_due_date" DATE,
        ADD COLUMN "report_due_date"   DATE
    `);

    // ── 5. Add submitted_by_name to discipline progress sections ─────────────
    //    (name snapshot at submission time — separate from therapistId)
    await queryRunner.query(`
      ALTER TABLE "eic_discipline_progress_sections"
        ADD COLUMN "submitted_by_name" VARCHAR(200)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "eic_discipline_progress_sections"
        DROP COLUMN IF EXISTS "submitted_by_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "eic_progress_reports"
        DROP COLUMN IF EXISTS "sections_due_date",
        DROP COLUMN IF EXISTS "report_due_date"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "eic_enrollment_discipline_assignments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."assignment_role_enum"`);
  }
}
