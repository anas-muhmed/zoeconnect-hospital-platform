import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Multi-language phase. Creates feedback_languages
 * (the global pool of languages available to translate into) and
 * feedback_translations (generic entity/field/language -> text rows, see
 * FeedbackTranslation's doc comment for why EAV-style). Seeds a small
 * starter language list -- English is always present since it matches
 * FeedbackForm.language's own default ('en'), the others are just common
 * starting points an admin can toggle off if unused.
 *
 * FEEDBACK:LANGUAGE:MANAGE gates the global language list (add/toggle a
 * supported language) -- editing a specific form's *translations* reuses
 * the existing FEEDBACK:FORM:EDIT permission rather than adding a new one,
 * since translating a form is a kind of editing it.
 */
export class CreateFeedbackLanguages1783660000000 implements MigrationInterface {
  name = 'CreateFeedbackLanguages1783660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feedback_languages" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "code"       VARCHAR(10) NOT NULL,
        "name"       VARCHAR(100) NOT NULL,
        "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_languages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feedback_languages_code" UNIQUE ("code")
      );

      CREATE TABLE "feedback_translations" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "form_id"       UUID NOT NULL,
        "entity_type"   VARCHAR(20) NOT NULL,
        "entity_id"     UUID NOT NULL,
        "field_name"    VARCHAR(50) NOT NULL,
        "language_code" VARCHAR(10) NOT NULL,
        "value"         TEXT NOT NULL,
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_feedback_translations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedback_translations_form" FOREIGN KEY ("form_id") REFERENCES "feedback_forms" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_feedback_translations_field" UNIQUE ("entity_type", "entity_id", "field_name", "language_code")
      );
      CREATE INDEX "IDX_feedback_translations_form_lang" ON "feedback_translations" ("form_id", "language_code");

      INSERT INTO "feedback_languages" ("code", "name") VALUES
        ('en', 'English'),
        ('ar', 'Arabic'),
        ('hi', 'Hindi')
      ON CONFLICT ("code") DO NOTHING;
    `);

    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'LANGUAGE', 'MANAGE', 'Manage the supported language list for patient feedback translations'],
    ];
    for (const [moduleCode, resource, action, description] of permissions) {
      await queryRunner.query(
        `INSERT INTO permissions (module_code, resource, action, description)
         VALUES ($1,$2,$3,$4) ON CONFLICT (module_code, resource, action) DO NOTHING`,
        [moduleCode, resource, action, description],
      );
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p
         WHERE r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
           AND p.module_code=$1 AND p.resource=$2 AND p.action=$3
         ON CONFLICT DO NOTHING`, [moduleCode, resource, action],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'LANGUAGE'
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'LANGUAGE';
      DROP TABLE IF EXISTS "feedback_translations";
      DROP TABLE IF EXISTS "feedback_languages";
    `);
  }
}
