import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCVPhase4_1789500000000 implements MigrationInterface {
  name = 'CreateCVPhase4_1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Timetables
    await queryRunner.query(`
      CREATE TABLE "cv_timetables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "class_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "term_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        CONSTRAINT "PK_cv_timetables" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_timetable_periods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "timetable_id" uuid NOT NULL,
        "day_of_week" varchar(20) NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "subject_id" uuid NOT NULL,
        "teacher_id" uuid NOT NULL,
        "room" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_periods" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_student_schedule_overrides" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "date" date,
        "day_of_week" varchar(20),
        "period_id" uuid,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "reason" varchar(255) NOT NULL,
        "override_teacher_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_schedule_overrides" PRIMARY KEY ("id")
      )
    `);

    // 2. Attendance
    await queryRunner.query(`
      CREATE TABLE "cv_student_attendance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "class_id" uuid,
        "period_id" uuid,
        "date" date NOT NULL,
        "status" varchar(50) NOT NULL,
        "remarks" text,
        "recorded_by" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_student_attendance" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_CV_ATTENDANCE_DATE" ON "cv_student_attendance" ("tenant_id", "date")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_ATTENDANCE_STUDENT" ON "cv_student_attendance" ("tenant_id", "student_id", "date")`);

    // 3. Daily Learning Records
    await queryRunner.query(`
      CREATE TABLE "cv_daily_learning_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "student_id" uuid NOT NULL,
        "class_id" uuid,
        "date" date NOT NULL,
        "teacher_id" uuid NOT NULL,
        "mood" varchar(50),
        "participation" varchar(50),
        "communication" varchar(50),
        "adl_eating" varchar(50),
        "adl_toileting" varchar(50),
        "adl_hand_washing" varchar(50),
        "adl_dressing" varchar(50),
        "adl_brushing" varchar(50),
        "behaviour_incidents" text,
        "therapy_carryover" text,
        "curriculum_notes" text,
        "homework" text,
        "parent_notes" text,
        "teacher_notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_daily_learning_records" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_CV_DLR_DATE" ON "cv_daily_learning_records" ("tenant_id", "date")`);
    await queryRunner.query(`CREATE INDEX "IDX_CV_DLR_STUDENT" ON "cv_daily_learning_records" ("tenant_id", "student_id", "date")`);

    // 4. Teacher Workspace
    await queryRunner.query(`
      CREATE TABLE "cv_teacher_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "teacher_id" uuid NOT NULL,
        "task_type" varchar(50) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "due_date" date,
        "status" varchar(50) NOT NULL DEFAULT 'PENDING',
        "related_student_id" uuid,
        "related_entity_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_teacher_tasks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_CV_TEACHER_TASKS" ON "cv_teacher_tasks" ("tenant_id", "teacher_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "cv_teacher_dashboard_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "teacher_id" uuid NOT NULL,
        "layout_config" jsonb,
        "theme" varchar(50) NOT NULL DEFAULT 'LIGHT',
        "notification_preferences" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_teacher_dashboard_preferences" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_CV_TEACHER_PREFS" ON "cv_teacher_dashboard_preferences" ("tenant_id", "teacher_id")`);
    
    // Add Foreign Keys
    await queryRunner.query(`ALTER TABLE "cv_timetables" ADD CONSTRAINT "FK_CV_TIMETABLES_CLASS" FOREIGN KEY ("class_id") REFERENCES "cv_classes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_timetable_periods" ADD CONSTRAINT "FK_CV_TIMETABLE_PERIODS_TIMETABLE" FOREIGN KEY ("timetable_id") REFERENCES "cv_timetables"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_student_schedule_overrides" ADD CONSTRAINT "FK_CV_OVERRIDES_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_student_attendance" ADD CONSTRAINT "FK_CV_ATTENDANCE_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "cv_daily_learning_records" ADD CONSTRAINT "FK_CV_DLR_STUDENT" FOREIGN KEY ("student_id") REFERENCES "cv_students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_daily_learning_records" DROP CONSTRAINT "FK_CV_DLR_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_student_attendance" DROP CONSTRAINT "FK_CV_ATTENDANCE_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_student_schedule_overrides" DROP CONSTRAINT "FK_CV_OVERRIDES_STUDENT"`);
    await queryRunner.query(`ALTER TABLE "cv_timetable_periods" DROP CONSTRAINT "FK_CV_TIMETABLE_PERIODS_TIMETABLE"`);
    await queryRunner.query(`ALTER TABLE "cv_timetables" DROP CONSTRAINT "FK_CV_TIMETABLES_CLASS"`);

    await queryRunner.query(`DROP TABLE "cv_teacher_dashboard_preferences"`);
    await queryRunner.query(`DROP TABLE "cv_teacher_tasks"`);
    await queryRunner.query(`DROP TABLE "cv_daily_learning_records"`);
    await queryRunner.query(`DROP TABLE "cv_student_attendance"`);
    await queryRunner.query(`DROP TABLE "cv_student_schedule_overrides"`);
    await queryRunner.query(`DROP TABLE "cv_timetable_periods"`);
    await queryRunner.query(`DROP TABLE "cv_timetables"`);
  }
}
