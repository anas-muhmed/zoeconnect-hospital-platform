import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVPhase7_1789800000000 implements MigrationInterface {
  name = 'CreateCVPhase7_1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Assessment Entities
    await queryRunner.query(`
      CREATE TABLE "cv_assessment_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "name" varchar(255) NOT NULL,
        "description" text,
        "type" varchar(50) NOT NULL,
        "scoring_scale" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_assessment_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ASSESS_TMPL_TENANT" ON "cv_assessment_templates" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_assessment_domains" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "template_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "sequence_order" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_assessment_domains" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ASSESS_DOMAIN_TENANT" ON "cv_assessment_domains" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_assessment_domains" ADD CONSTRAINT "FK_CV_ASSESS_DOMAIN_TMPL" FOREIGN KEY ("template_id") REFERENCES "cv_assessment_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE "cv_student_assessments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "date_conducted" date NOT NULL,
        "assessor_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'DRAFT',
        "version" int NOT NULL DEFAULT 1,
        "overall_score" numeric(5,2),
        "clinical_notes" text,
        "recommendations" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_assessments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_STUDENT_ASSESS_TENANT" ON "cv_student_assessments" ("tenant_id", "student_id")`);
    await queryRunner.query(`ALTER TABLE "cv_student_assessments" ADD CONSTRAINT "FK_CV_STU_ASSESS_TMPL" FOREIGN KEY ("template_id") REFERENCES "cv_assessment_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE "cv_student_assessment_scores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "assessment_id" uuid NOT NULL,
        "domain_id" uuid NOT NULL,
        "item_name" varchar(255) NOT NULL,
        "raw_score" int,
        "value" varchar(100),
        "observation" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_assessment_scores" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_S_ASSESS_SCORES_TENANT" ON "cv_student_assessment_scores" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_student_assessment_scores" ADD CONSTRAINT "FK_CV_STU_ASSESS_SCORE_ASSESS" FOREIGN KEY ("assessment_id") REFERENCES "cv_student_assessments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_student_assessment_scores" ADD CONSTRAINT "FK_CV_STU_ASSESS_SCORE_DOMAIN" FOREIGN KEY ("domain_id") REFERENCES "cv_assessment_domains"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    // 2. Calendar and Events
    await queryRunner.query(`
      CREATE TABLE "cv_calendar_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "type" varchar(50) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "is_full_day" boolean NOT NULL DEFAULT true,
        "affects_attendance" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_calendar_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CALENDAR_EVENTS_TENANT" ON "cv_calendar_events" ("tenant_id", "academic_year_id")`);
    await queryRunner.query(`ALTER TABLE "cv_calendar_events" ADD CONSTRAINT "FK_CV_CAL_EVT_ACAD_YR" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`
      CREATE TABLE "cv_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "type" varchar(50) NOT NULL,
        "start_time" timestamp NOT NULL,
        "end_time" timestamp NOT NULL,
        "location" varchar(255),
        "organizer_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_EVENTS_TENANT" ON "cv_events" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_event_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "event_id" uuid NOT NULL,
        "participant_type" varchar(50) NOT NULL,
        "participant_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'INVITED',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_event_participants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_EVENT_PARTS_TENANT" ON "cv_event_participants" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_event_participants" ADD CONSTRAINT "FK_CV_EVT_PART_EVENT" FOREIGN KEY ("event_id") REFERENCES "cv_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    // 3. Resources and Classrooms
    await queryRunner.query(`
      CREATE TABLE "cv_classrooms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "room_type" varchar(50) NOT NULL,
        "capacity" int NOT NULL,
        "accessibility_features" jsonb,
        "assigned_teacher_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_classrooms" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CLASSROOMS_TENANT" ON "cv_classrooms" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_resources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "category" varchar(50) NOT NULL,
        "description" text,
        "barcode" varchar(100),
        "status" varchar(50) NOT NULL DEFAULT 'AVAILABLE',
        "lifecycle_state" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_resources" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_RESOURCES_TENANT" ON "cv_resources" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_resource_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "resource_id" uuid NOT NULL,
        "booked_by" uuid NOT NULL,
        "start_time" timestamp NOT NULL,
        "end_time" timestamp NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'CONFIRMED',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_resource_bookings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_RESOURCE_BOOKINGS_TENANT" ON "cv_resource_bookings" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_resource_bookings" ADD CONSTRAINT "FK_CV_RES_BOOK_RES" FOREIGN KEY ("resource_id") REFERENCES "cv_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    // 4. Documents
    await queryRunner.query(`
      CREATE TABLE "cv_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "document_type" varchar(100) NOT NULL,
        "title" varchar(255) NOT NULL,
        "category" varchar(100),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_DOCUMENTS_TENANT" ON "cv_documents" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_document_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "version_number" int NOT NULL DEFAULT 1,
        "object_id" uuid NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "content_type" varchar(100),
        "size_bytes" bigint,
        "expiry_date" date,
        "is_verified" boolean NOT NULL DEFAULT false,
        "uploaded_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_document_versions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_DOCUMENT_VERSIONS_TENANT" ON "cv_document_versions" ("tenant_id")`);
    await queryRunner.query(`ALTER TABLE "cv_document_versions" ADD CONSTRAINT "FK_CV_DOC_VER_DOC" FOREIGN KEY ("document_id") REFERENCES "cv_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_document_versions" DROP CONSTRAINT "FK_CV_DOC_VER_DOC"`);
    await queryRunner.query(`DROP TABLE "cv_document_versions"`);
    await queryRunner.query(`DROP TABLE "cv_documents"`);

    await queryRunner.query(`ALTER TABLE "cv_resource_bookings" DROP CONSTRAINT "FK_CV_RES_BOOK_RES"`);
    await queryRunner.query(`DROP TABLE "cv_resource_bookings"`);
    await queryRunner.query(`DROP TABLE "cv_resources"`);
    await queryRunner.query(`DROP TABLE "cv_classrooms"`);

    await queryRunner.query(`ALTER TABLE "cv_event_participants" DROP CONSTRAINT "FK_CV_EVT_PART_EVENT"`);
    await queryRunner.query(`DROP TABLE "cv_event_participants"`);
    await queryRunner.query(`DROP TABLE "cv_events"`);
    await queryRunner.query(`ALTER TABLE "cv_calendar_events" DROP CONSTRAINT "FK_CV_CAL_EVT_ACAD_YR"`);
    await queryRunner.query(`DROP TABLE "cv_calendar_events"`);

    await queryRunner.query(`ALTER TABLE "cv_student_assessment_scores" DROP CONSTRAINT "FK_CV_STU_ASSESS_SCORE_DOMAIN"`);
    await queryRunner.query(`ALTER TABLE "cv_student_assessment_scores" DROP CONSTRAINT "FK_CV_STU_ASSESS_SCORE_ASSESS"`);
    await queryRunner.query(`DROP TABLE "cv_student_assessment_scores"`);
    
    await queryRunner.query(`ALTER TABLE "cv_student_assessments" DROP CONSTRAINT "FK_CV_STU_ASSESS_TMPL"`);
    await queryRunner.query(`DROP TABLE "cv_student_assessments"`);
    
    await queryRunner.query(`ALTER TABLE "cv_assessment_domains" DROP CONSTRAINT "FK_CV_ASSESS_DOMAIN_TMPL"`);
    await queryRunner.query(`DROP TABLE "cv_assessment_domains"`);
    await queryRunner.query(`DROP TABLE "cv_assessment_templates"`);
  }
}
