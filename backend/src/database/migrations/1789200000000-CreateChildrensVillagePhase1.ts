import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChildrensVillagePhase1_1789200000000 implements MigrationInterface {
  name = 'CreateChildrensVillagePhase1_1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Academic Years
    await queryRunner.query(`
      CREATE TABLE "cv_academic_years" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "hospital_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_academic_years" PRIMARY KEY ("id")
      )
    `);

    // 2. Classes
    await queryRunner.query(`
      CREATE TABLE "cv_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "academic_year_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "capacity" integer NOT NULL DEFAULT 20,
        "age_group" character varying(100),
        "disability_category" character varying(100),
        "room_number" character varying(50),
        "color" character varying(20),
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "hospital_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_classes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_classes_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // 3. Sections
    await queryRunner.query(`
      CREATE TABLE "cv_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "class_id" uuid NOT NULL,
        "name" character varying(50) NOT NULL,
        "capacity" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "hospital_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_sections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_sections_class" FOREIGN KEY ("class_id") REFERENCES "cv_classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // 4. Subjects
    await queryRunner.query(`
      CREATE TABLE "cv_subjects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "code" character varying(50),
        "category" character varying NOT NULL DEFAULT 'ACADEMIC',
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "hospital_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_subjects" PRIMARY KEY ("id")
      )
    `);

    // 5. Seed Permissions (Admin)
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code", "resource", "action", "description") VALUES
      ('CV', 'ACADEMIC_YEAR', 'READ',   'Read Academic Years'),
      ('CV', 'ACADEMIC_YEAR', 'CREATE', 'Create Academic Years'),
      ('CV', 'ACADEMIC_YEAR', 'UPDATE', 'Update Academic Years'),
      ('CV', 'CLASS',         'READ',   'Read Classes'),
      ('CV', 'CLASS',         'CREATE', 'Create Classes'),
      ('CV', 'CLASS',         'UPDATE', 'Update Classes'),
      ('CV', 'SECTION',       'READ',   'Read Sections'),
      ('CV', 'SECTION',       'CREATE', 'Create Sections'),
      ('CV', 'SECTION',       'UPDATE', 'Update Sections'),
      ('CV', 'SUBJECT',       'READ',   'Read Subjects'),
      ('CV', 'SUBJECT',       'CREATE', 'Create Subjects'),
      ('CV', 'SUBJECT',       'UPDATE', 'Update Subjects')
      ON CONFLICT ("module_code", "resource", "action") DO NOTHING
    `);

    // 6. Grant to SUPER_ADMIN / HOSPITAL_ADMIN, mirroring the pattern used by
    // other modules (e.g. INCIDENT, PLATFORM:ORG_BRANCHES).
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN')
        AND p.module_code = 'CV'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cv_subjects"`);
    await queryRunner.query(`DROP TABLE "cv_sections"`);
    await queryRunner.query(`DROP TABLE "cv_classes"`);
    await queryRunner.query(`DROP TABLE "cv_academic_years"`);
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "module_code" = 'CV')
    `);
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "module_code" = 'CV'
    `);
  }
}
