import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVPhase5_1789600000000 implements MigrationInterface {
  name = 'CreateCVPhase5_1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Curriculum Entities
    await queryRunner.query(`
      CREATE TABLE "cv_curriculum_frameworks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "name" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "PK_cv_curriculum_frameworks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CURRICULUM_FW_TENANT" ON "cv_curriculum_frameworks" ("tenant_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE "cv_grades" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "framework_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "level_sequence" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_grades" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_GRADES_TENANT" ON "cv_grades" ("tenant_id", "framework_id")`);

    // Alter cv_classes to add grade_id
    await queryRunner.query(`ALTER TABLE "cv_classes" ADD "grade_id" uuid`);

    await queryRunner.query(`
      CREATE TABLE "cv_curriculum_units" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "grade_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "sequence_order" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_curriculum_units" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CURRICULUM_UNITS" ON "cv_curriculum_units" ("tenant_id", "grade_id", "subject_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_curriculum_topics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "unit_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "sequence_order" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_curriculum_topics" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CURRICULUM_TOPICS" ON "cv_curriculum_topics" ("tenant_id", "unit_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_curriculum_objectives" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "topic_id" uuid NOT NULL,
        "code" varchar(50),
        "name" varchar(255) NOT NULL,
        "description" text,
        "sequence_order" int NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_curriculum_objectives" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_CURRICULUM_OBJECTIVES" ON "cv_curriculum_objectives" ("tenant_id", "topic_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_student_curriculum_progress" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "objective_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'NOT_INTRODUCED',
        "notes" text,
        "last_assessed_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_curriculum_progress" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_STUDENT_PROGRESS_TENANT" ON "cv_student_curriculum_progress" ("tenant_id", "student_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_CV_STUDENT_PROGRESS_OBJ" ON "cv_student_curriculum_progress" ("tenant_id", "student_id", "objective_id")`);


    // 2. IEP Entities
    await queryRunner.query(`
      CREATE TABLE "cv_iep_domains" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "name" varchar(100) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_iep_domains" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_IEP_DOMAINS_TENANT" ON "cv_iep_domains" ("tenant_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE "cv_ieps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'DRAFT',
        "version" int NOT NULL DEFAULT 1,
        "reviewer_id" uuid,
        "approval_date" date,
        "change_reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "PK_cv_ieps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_IEPS_TENANT" ON "cv_ieps" ("tenant_id", "student_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "cv_iep_goals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "iep_id" uuid NOT NULL,
        "domain_id" uuid NOT NULL,
        "description" text NOT NULL,
        "baseline" text,
        "target" text,
        "status" varchar(50) NOT NULL DEFAULT 'NOT_STARTED',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_iep_goals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_IEP_GOALS_TENANT" ON "cv_iep_goals" ("tenant_id", "iep_id")`);

    await queryRunner.query(`
      CREATE TABLE "cv_iep_reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "goal_id" uuid NOT NULL,
        "review_date" date NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "progress_notes" text NOT NULL,
        "status_update" varchar(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_iep_reviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_IEP_REVIEWS_TENANT" ON "cv_iep_reviews" ("tenant_id", "goal_id")`);

    // 3. Development Entities
    await queryRunner.query(`
      CREATE TABLE "cv_behaviours" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "date" date NOT NULL,
        "reporter_id" uuid NOT NULL,
        "type" varchar(50) NOT NULL,
        "category" varchar(100) NOT NULL,
        "description" text,
        "intensity" varchar(50),
        "action_taken" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_behaviours" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_BEHAVIOURS_TENANT" ON "cv_behaviours" ("tenant_id", "student_id", "date")`);

    await queryRunner.query(`
      CREATE TABLE "cv_home_programs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "start_date" date NOT NULL,
        "due_date" date,
        "frequency" varchar(100),
        "responsible_guardian_id" uuid,
        "status" varchar(50) NOT NULL DEFAULT 'ASSIGNED',
        "assigned_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_home_programs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_HOME_PROGRAMS_TENANT" ON "cv_home_programs" ("tenant_id", "student_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "cv_parent_diaries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "sender_type" varchar(50) NOT NULL,
        "sender_id" uuid NOT NULL,
        "receiver_type" varchar(50) NOT NULL,
        "message_type" varchar(50) NOT NULL DEFAULT 'MESSAGE',
        "content" text NOT NULL,
        "has_attachments" boolean NOT NULL DEFAULT false,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMP,
        "replies_enabled" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_parent_diaries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_CV_PARENT_DIARIES_TENANT" ON "cv_parent_diaries" ("tenant_id", "student_id", "created_at")`);


    // Foreign Keys
    await queryRunner.query(`ALTER TABLE "cv_grades" ADD CONSTRAINT "FK_CV_GRADES_FW" FOREIGN KEY ("framework_id") REFERENCES "cv_curriculum_frameworks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_classes" ADD CONSTRAINT "FK_CV_CLASSES_GRADE" FOREIGN KEY ("grade_id") REFERENCES "cv_grades"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_units" ADD CONSTRAINT "FK_CV_C_UNITS_GRADE" FOREIGN KEY ("grade_id") REFERENCES "cv_grades"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_units" ADD CONSTRAINT "FK_CV_C_UNITS_SUBJECT" FOREIGN KEY ("subject_id") REFERENCES "cv_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_topics" ADD CONSTRAINT "FK_CV_C_TOPICS_UNIT" FOREIGN KEY ("unit_id") REFERENCES "cv_curriculum_units"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_objectives" ADD CONSTRAINT "FK_CV_C_OBJ_TOPIC" FOREIGN KEY ("topic_id") REFERENCES "cv_curriculum_topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_student_curriculum_progress" ADD CONSTRAINT "FK_CV_S_PROG_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_student_curriculum_progress" ADD CONSTRAINT "FK_CV_S_PROG_OBJ" FOREIGN KEY ("objective_id") REFERENCES "cv_curriculum_objectives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    
    await queryRunner.query(`ALTER TABLE "cv_ieps" ADD CONSTRAINT "FK_CV_IEP_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_ieps" ADD CONSTRAINT "FK_CV_IEP_AY" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_iep_goals" ADD CONSTRAINT "FK_CV_IEP_G_IEP" FOREIGN KEY ("iep_id") REFERENCES "cv_ieps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_iep_goals" ADD CONSTRAINT "FK_CV_IEP_G_DOMAIN" FOREIGN KEY ("domain_id") REFERENCES "cv_iep_domains"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_iep_reviews" ADD CONSTRAINT "FK_CV_IEP_R_GOAL" FOREIGN KEY ("goal_id") REFERENCES "cv_iep_goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`ALTER TABLE "cv_behaviours" ADD CONSTRAINT "FK_CV_BEHAV_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_home_programs" ADD CONSTRAINT "FK_CV_HP_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_home_programs" ADD CONSTRAINT "FK_CV_HP_GUARDIAN" FOREIGN KEY ("responsible_guardian_id") REFERENCES "cv_guardians"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_parent_diaries" ADD CONSTRAINT "FK_CV_PD_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_parent_diaries" DROP CONSTRAINT "FK_CV_PD_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_home_programs" DROP CONSTRAINT "FK_CV_HP_GUARDIAN"`);
    await queryRunner.query(`ALTER TABLE "cv_home_programs" DROP CONSTRAINT "FK_CV_HP_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_behaviours" DROP CONSTRAINT "FK_CV_BEHAV_STUDENT"`);
    
    await queryRunner.query(`ALTER TABLE "cv_iep_reviews" DROP CONSTRAINT "FK_CV_IEP_R_GOAL"`);
    await queryRunner.query(`ALTER TABLE "cv_iep_goals" DROP CONSTRAINT "FK_CV_IEP_G_DOMAIN"`);
    await queryRunner.query(`ALTER TABLE "cv_iep_goals" DROP CONSTRAINT "FK_CV_IEP_G_IEP"`);
    await queryRunner.query(`ALTER TABLE "cv_ieps" DROP CONSTRAINT "FK_CV_IEP_AY"`);
    await queryRunner.query(`ALTER TABLE "cv_ieps" DROP CONSTRAINT "FK_CV_IEP_STUDENT"`);

    await queryRunner.query(`ALTER TABLE "cv_student_curriculum_progress" DROP CONSTRAINT "FK_CV_S_PROG_OBJ"`);
    await queryRunner.query(`ALTER TABLE "cv_student_curriculum_progress" DROP CONSTRAINT "FK_CV_S_PROG_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_objectives" DROP CONSTRAINT "FK_CV_C_OBJ_TOPIC"`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_topics" DROP CONSTRAINT "FK_CV_C_TOPICS_UNIT"`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_units" DROP CONSTRAINT "FK_CV_C_UNITS_SUBJECT"`);
    await queryRunner.query(`ALTER TABLE "cv_curriculum_units" DROP CONSTRAINT "FK_CV_C_UNITS_GRADE"`);
    await queryRunner.query(`ALTER TABLE "cv_classes" DROP CONSTRAINT "FK_CV_CLASSES_GRADE"`);
    await queryRunner.query(`ALTER TABLE "cv_grades" DROP CONSTRAINT "FK_CV_GRADES_FW"`);

    await queryRunner.query(`ALTER TABLE "cv_classes" DROP COLUMN "grade_id"`);

    await queryRunner.query(`DROP TABLE "cv_parent_diaries"`);
    await queryRunner.query(`DROP TABLE "cv_home_programs"`);
    await queryRunner.query(`DROP TABLE "cv_behaviours"`);
    await queryRunner.query(`DROP TABLE "cv_iep_reviews"`);
    await queryRunner.query(`DROP TABLE "cv_iep_goals"`);
    await queryRunner.query(`DROP TABLE "cv_ieps"`);
    await queryRunner.query(`DROP TABLE "cv_iep_domains"`);
    await queryRunner.query(`DROP TABLE "cv_student_curriculum_progress"`);
    await queryRunner.query(`DROP TABLE "cv_curriculum_objectives"`);
    await queryRunner.query(`DROP TABLE "cv_curriculum_topics"`);
    await queryRunner.query(`DROP TABLE "cv_curriculum_units"`);
    await queryRunner.query(`DROP TABLE "cv_grades"`);
    await queryRunner.query(`DROP TABLE "cv_curriculum_frameworks"`);
  }
}
