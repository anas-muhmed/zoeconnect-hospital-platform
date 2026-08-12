import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LifeGenX integration (ZoeConnect delivery phase).
 *
 * Ported from zoe-platform's `src/modules/lifegenx/backend/prisma/
 * schema.prisma` — a single Prisma `Consultation` model. Prisma's own
 * `User` model is NOT ported as a table: the source ran a fully separate
 * authentication system (own bcrypt/JWT, including a live universal-
 * password bypass — see `1797000000000-SeedLifeGenXRbac`'s doc comment
 * and the integration report) that is replaced entirely by ZoeConnect's
 * own `User`/RBAC, same "identity becomes an ordinary ZoeConnect User"
 * pattern Mortuary and Drug Indenting already established.
 *
 * `tenant_id NOT NULL REFERENCES tenant(id)` is pure addition — the
 * source (single global SQLite file) had no tenant concept at all.
 * `doctor_id REFERENCES users(id)` preserves Prisma's real required
 * relation (`doctor User @relation`), same evidence-based FK-preservation
 * rule Drug Indenting's migration established.
 */
export class CreateLifeGenXSchema1796000000000 implements MigrationInterface {
  name = 'CreateLifeGenXSchema1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lifegenx_consultations" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"         uuid NOT NULL REFERENCES "tenant"("id") ON DELETE RESTRICT,
        "patient_name"      varchar(300) NOT NULL DEFAULT 'Anonymous Patient',
        "patient_age"       int,
        "patient_gender"    varchar(50) DEFAULT 'Unspecified',
        "audio_path"        varchar(1000),
        "audio_file_name"   varchar(500),
        "duration"          varchar(50),
        "transcript"        text NOT NULL,
        "symptoms"          text NOT NULL,
        "observations"      text NOT NULL,
        "diagnoses"         text NOT NULL,
        "doctor_id"         uuid NOT NULL REFERENCES "users"("id"),
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_lifegenx_consultations_tenant" ON "lifegenx_consultations" ("tenant_id");`);
    await queryRunner.query(`CREATE INDEX "idx_lifegenx_consultations_doctor" ON "lifegenx_consultations" ("doctor_id");`);
    await queryRunner.query(`CREATE INDEX "idx_lifegenx_consultations_created_at" ON "lifegenx_consultations" ("created_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "lifegenx_consultations";`);
  }
}
