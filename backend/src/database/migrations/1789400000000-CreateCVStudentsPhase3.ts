import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVStudentsPhase31789400000000 implements MigrationInterface {
  name = 'CreateCVStudentsPhase31789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add class_teacher_id to cv_classes
    await queryRunner.query(`
      ALTER TABLE "cv_classes" ADD "class_teacher_id" uuid
    `);

    // 2. Add new fields to cv_students
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "admission_number" varchar(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "student_code" varchar(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "admission_status" varchar(50) NOT NULL DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "student_status" varchar(50) NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "address" text
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_students" ADD "photo_url" varchar(1000)
    `);

    // 3. Create cv_terms
    await queryRunner.query(`
      CREATE TABLE "cv_terms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "academic_year_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "name" varchar(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "PK_cv_terms" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_terms" ADD CONSTRAINT "FK_cv_terms_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 4. Create cv_guardians
    await queryRunner.query(`
      CREATE TABLE "cv_guardians" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "first_name" varchar(150) NOT NULL,
        "last_name" varchar(150) NOT NULL,
        "email" varchar(255),
        "phone" varchar(50),
        "address" text,
        "occupation" varchar(100),
        "preferred_contact_method" varchar(50),
        "parent_portal_enabled" boolean NOT NULL DEFAULT false,
        "user_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_guardians" PRIMARY KEY ("id")
      )
    `);

    // 5. Create cv_student_guardian_links
    await queryRunner.query(`
      CREATE TABLE "cv_student_guardian_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "guardian_id" uuid NOT NULL,
        "relationship" varchar(100) NOT NULL,
        "guardian_type" varchar(50),
        "is_primary_guardian" boolean NOT NULL DEFAULT false,
        "is_emergency_contact" boolean NOT NULL DEFAULT false,
        "receives_notifications" boolean NOT NULL DEFAULT true,
        "receives_reports" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_guardian_links" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_guardian_links" ADD CONSTRAINT "FK_cv_student_guardian_links_student" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_guardian_links" ADD CONSTRAINT "FK_cv_student_guardian_links_guardian" FOREIGN KEY ("guardian_id") REFERENCES "cv_guardians"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 6. Create cv_student_documents
    await queryRunner.query(`
      CREATE TABLE "cv_student_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "document_type" varchar(100) NOT NULL,
        "title" varchar(255) NOT NULL,
        "object_id" uuid NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "content_type" varchar(100),
        "size_bytes" bigint,
        "is_verified" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_cv_student_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_documents" ADD CONSTRAINT "FK_cv_student_documents_student" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 7. Create cv_student_medical_profiles
    await queryRunner.query(`
      CREATE TABLE "cv_student_medical_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "blood_group" varchar(10),
        "allergies" text,
        "specific_conditions" text,
        "disability_type" varchar(100),
        "disability_percentage" int,
        "medication_notes" text,
        "dietary_requirements" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_by" uuid,
        CONSTRAINT "PK_cv_student_medical_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cv_student_medical_profiles_student" UNIQUE ("student_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_medical_profiles" ADD CONSTRAINT "FK_cv_student_medical_profiles_student" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 8. Create cv_student_allocations
    await queryRunner.query(`
      CREATE TABLE "cv_student_allocations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date,
        "status" varchar(50) NOT NULL DEFAULT 'ACTIVE',
        "previous_teacher_id" uuid,
        "previous_section_id" uuid,
        "transfer_reason" text,
        "promotion_reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "PK_cv_student_allocations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_allocations" ADD CONSTRAINT "FK_cv_student_allocations_student" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_allocations" ADD CONSTRAINT "FK_cv_student_allocations_class" FOREIGN KEY ("class_id") REFERENCES "cv_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_student_allocations" ADD CONSTRAINT "FK_cv_student_allocations_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Permissions for Phase 3
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code", "resource", "action", "description") VALUES
      ('CV', 'ADMISSIONS', 'CREATE', 'Create student admissions'),
      ('CV', 'ADMISSIONS', 'UPDATE', 'Update student admissions'),
      ('CV', 'STUDENT',    'READ',   'View student profiles'),
      ('CV', 'STUDENT',    'UPDATE', 'Update student profiles'),
      ('CV', 'ALLOCATION', 'CREATE', 'Allocate students to classes'),
      ('CV', 'ALLOCATION', 'UPDATE', 'Transfer or promote students'),
      ('CV', 'ALLOCATION', 'READ',   'View student allocations')
      ON CONFLICT ("module_code", "resource", "action") DO NOTHING
    `);

    // Grant to SUPER_ADMIN / HOSPITAL_ADMIN, mirroring Phase 1.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN')
        AND p.module_code = 'CV'
        AND p.resource IN ('ADMISSIONS', 'STUDENT', 'ALLOCATION')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_student_allocations" DROP CONSTRAINT "FK_cv_student_allocations_academic_year"`);
    await queryRunner.query(`ALTER TABLE "cv_student_allocations" DROP CONSTRAINT "FK_cv_student_allocations_class"`);
    await queryRunner.query(`ALTER TABLE "cv_student_allocations" DROP CONSTRAINT "FK_cv_student_allocations_student"`);
    await queryRunner.query(`DROP TABLE "cv_student_allocations"`);

    await queryRunner.query(`ALTER TABLE "cv_student_medical_profiles" DROP CONSTRAINT "FK_cv_student_medical_profiles_student"`);
    await queryRunner.query(`DROP TABLE "cv_student_medical_profiles"`);

    await queryRunner.query(`ALTER TABLE "cv_student_documents" DROP CONSTRAINT "FK_cv_student_documents_student"`);
    await queryRunner.query(`DROP TABLE "cv_student_documents"`);

    await queryRunner.query(`ALTER TABLE "cv_student_guardian_links" DROP CONSTRAINT "FK_cv_student_guardian_links_guardian"`);
    await queryRunner.query(`ALTER TABLE "cv_student_guardian_links" DROP CONSTRAINT "FK_cv_student_guardian_links_student"`);
    await queryRunner.query(`DROP TABLE "cv_student_guardian_links"`);

    await queryRunner.query(`DROP TABLE "cv_guardians"`);

    await queryRunner.query(`ALTER TABLE "cv_terms" DROP CONSTRAINT "FK_cv_terms_academic_year"`);
    await queryRunner.query(`DROP TABLE "cv_terms"`);

    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "photo_url"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "student_status"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "admission_status"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "student_code"`);
    await queryRunner.query(`ALTER TABLE "cv_students" DROP COLUMN "admission_number"`);

    await queryRunner.query(`ALTER TABLE "cv_classes" DROP COLUMN "class_teacher_id"`);
  }
}
