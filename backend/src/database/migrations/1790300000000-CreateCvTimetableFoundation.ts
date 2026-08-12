import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Children's Village Timetable Management -- Phase 1 (Foundation), per the
 * approved Enterprise Timetable Design Specification (2026-08-03).
 *
 * Purely additive: no existing column, table, or row is removed or
 * renamed. Everything here is either a new nullable/defaulted column on an
 * existing table, or a brand new table.
 *
 * Design-review conflicts resolved before writing this migration (see
 * chat -- both confirmed by the user):
 *  - Period resource linkage reuses the EXISTING `cv_classrooms` table
 *    (rooms) rather than introducing a new generic `cv_resources`-style
 *    table -- `cv_resources`/`cv_resource_bookings` already exist for
 *    loose equipment (THERAPY_EQUIPMENT/AAC_DEVICE/etc.), a different
 *    concept, and are left untouched.
 *  - "Special Days" extends the EXISTING `cv_calendar_events` table
 *    (already has HOLIDAY/WORKING_DAY/EXAM_DAY/INSET_DAY via a free-text
 *    `type` column) rather than a new `cv_special_days` table, so there is
 *    one calendar, not two that can drift apart.
 *
 * Deliberately NOT done in this migration (flagged as remaining work in
 * the Phase 1 report, not silently skipped):
 *  - No partial-unique "only one ACTIVE version per class+year+term"
 *    constraint yet -- existing `cv_timetables` rows have never been
 *    constrained this way, and enforcing it blind (without first auditing
 *    production data for pre-existing duplicates) risks a failed
 *    migration on real data. Deferred to Phase 2 after that audit runs.
 *  - No hard FK from `teacher_id`/`user_id` columns to the platform
 *    `users` table -- follows the existing codebase-wide convention
 *    (`CvTimetablePeriod.teacherId`, `CvClass.classTeacherId`, etc. are
 *    all bare, unenforced uuids) rather than introducing the first
 *    exception to that pattern unilaterally.
 */
export class CreateCvTimetableFoundation1790300000000 implements MigrationInterface {
  name = 'CreateCvTimetableFoundation1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // 1. Extend cv_timetables with versioning / lifecycle / publish metadata
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "cv_timetables"
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
        ADD COLUMN IF NOT EXISTS "parent_version_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "effective_from" date NULL,
        ADD COLUMN IF NOT EXISTS "effective_to" date NULL,
        ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "published_by" uuid NULL,
        ADD COLUMN IF NOT EXISTS "change_type" varchar(30) NULL,
        ADD COLUMN IF NOT EXISTS "superseded_by_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_timetables"
        ADD CONSTRAINT "FK_cv_timetables_parent_version"
        FOREIGN KEY ("parent_version_id") REFERENCES "cv_timetables"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_timetables"
        ADD CONSTRAINT "FK_cv_timetables_superseded_by"
        FOREIGN KEY ("superseded_by_id") REFERENCES "cv_timetables"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Backfill: keep the new `status` column semantically aligned with the
    // pre-existing `is_active` flag for every row that already exists,
    // instead of leaving every historical timetable stuck at the column
    // default of 'DRAFT'.
    await queryRunner.query(`
      UPDATE "cv_timetables"
      SET "status" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'ARCHIVED' END,
          "published_at" = COALESCE("published_at", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CV_TIMETABLES_CLASS_YEAR_TERM_STATUS"
        ON "cv_timetables" ("class_id", "academic_year_id", "term_id", "status")
    `);

    // ------------------------------------------------------------------
    // 2. Extend cv_timetable_periods with notes, period_number, and a room
    //    reference (FK to the existing cv_classrooms table -- see header)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "cv_timetable_periods"
        ADD COLUMN IF NOT EXISTS "resource_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "notes" text NULL,
        ADD COLUMN IF NOT EXISTS "period_number" integer NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_timetable_periods"
        ADD CONSTRAINT "FK_cv_timetable_periods_resource"
        FOREIGN KEY ("resource_id") REFERENCES "cv_classrooms"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Conflict-detection indexes -- the existing table had none beyond its
    // PK/FK, so today a teacher or room can be double-booked with no
    // efficient way to even check. These are additive and read-only until
    // the Phase 4 Conflict Engine is built on top of them.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CV_TT_PERIODS_TEACHER_SLOT"
        ON "cv_timetable_periods" ("teacher_id", "day_of_week", "start_time", "end_time", "tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CV_TT_PERIODS_RESOURCE_SLOT"
        ON "cv_timetable_periods" ("resource_id", "day_of_week", "start_time", "end_time", "tenant_id")
    `);

    // ------------------------------------------------------------------
    // 3. Extend cv_calendar_events ("Special Days") instead of a new table
    // ------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "cv_calendar_events"
        ADD COLUMN IF NOT EXISTS "affects_all_classes" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "affected_class_ids" uuid[] NULL,
        ADD COLUMN IF NOT EXISTS "timetable_behavior" varchar(20) NULL
    `);

    // ------------------------------------------------------------------
    // 4. New table: cv_class_subject_teachers
    //    Fills a confirmed gap -- no table today declares which teachers
    //    are assigned/eligible to teach a subject for a class; it was only
    //    ever inferred from whichever teacher_id happens to appear on a
    //    cv_timetable_periods row.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cv_class_subject_teachers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "teacher_id" uuid NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "effective_from" date NULL,
        "effective_to" date NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_class_subject_teachers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_cst_class" FOREIGN KEY ("class_id") REFERENCES "cv_classes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_cst_subject" FOREIGN KEY ("subject_id") REFERENCES "cv_subjects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_cst_academic_year" FOREIGN KEY ("academic_year_id") REFERENCES "cv_academic_years"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_CST_TENANT" ON "cv_class_subject_teachers" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_CST_CLASS_SUBJECT" ON "cv_class_subject_teachers" ("class_id", "subject_id", "academic_year_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_CST_TEACHER" ON "cv_class_subject_teachers" ("teacher_id", "tenant_id")
    `);

    // ------------------------------------------------------------------
    // 5. New table: cv_teacher_profiles
    //    Thin, additive -- not a full HR entity. Populated lazily/upserted
    //    on first assignment. Deliberately does not duplicate an eventual
    //    platform User/HR module.
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cv_teacher_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "user_id" uuid NOT NULL,
        "subjects_qualified" uuid[] NULL,
        "max_periods_per_day" integer NULL,
        "max_periods_per_week" integer NULL,
        "is_substitute_eligible" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_teacher_profiles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_CV_TEACHER_PROFILES_TENANT_USER" ON "cv_teacher_profiles" ("tenant_id", "user_id")
    `);

    // ------------------------------------------------------------------
    // 6. New table: cv_teacher_availability
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cv_teacher_availability" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "teacher_id" uuid NOT NULL,
        "type" varchar(30) NOT NULL,
        "severity" varchar(10) NOT NULL DEFAULT 'HARD_BLOCK',
        "start_datetime" TIMESTAMP NOT NULL,
        "end_datetime" TIMESTAMP NOT NULL,
        "reason" text,
        "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_teacher_availability" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cv_teacher_availability_range" CHECK ("end_datetime" > "start_datetime")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TEACHER_AVAILABILITY_TEACHER_SLOT"
        ON "cv_teacher_availability" ("teacher_id", "start_datetime", "end_datetime")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TEACHER_AVAILABILITY_TENANT" ON "cv_teacher_availability" ("tenant_id")
    `);

    // ------------------------------------------------------------------
    // 7. New table: cv_lesson_completion_records
    //    Optional per the design brief -- absence of a row means "not yet
    //    marked", not an error state. One row per (period, date).
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cv_lesson_completion_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "period_id" uuid NOT NULL,
        "override_id" uuid NULL,
        "date" date NOT NULL,
        "teacher_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'COMPLETED',
        "notes" text,
        "marked_by" uuid,
        "marked_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_lesson_completion_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_lcr_period" FOREIGN KEY ("period_id") REFERENCES "cv_timetable_periods"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cv_lcr_override" FOREIGN KEY ("override_id") REFERENCES "cv_timetable_period_overrides"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_CV_LCR_PERIOD_DATE" ON "cv_lesson_completion_records" ("period_id", "date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_LCR_TENANT_DATE" ON "cv_lesson_completion_records" ("tenant_id", "date")
    `);

    // ------------------------------------------------------------------
    // 8. New table: cv_timetable_approval_config
    //    Configurable approval matrix, keyed per tenant + change type.
    //    `workflow_template_id` is a soft (unenforced) pointer into the
    //    existing document-platform workflow engine's
    //    `hdsp_document_workflow_templates` table -- no hard cross-module
    //    FK, consistent with how CV already treats cross-module references
    //    (e.g. EIC integration adapter).
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "cv_timetable_approval_config" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "change_type" varchar(30) NOT NULL,
        "approval_mode" varchar(20) NOT NULL DEFAULT 'DISABLED',
        "workflow_template_id" uuid NULL,
        "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_approval_config" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_CV_TT_APPROVAL_CONFIG_TENANT_CHANGE_TYPE"
        ON "cv_timetable_approval_config" ("tenant_id", "change_type")
    `);

    // ------------------------------------------------------------------
    // 9. Permissions -- baseline only (SUPER_ADMIN / HOSPITAL_ADMIN),
    //    mirroring 1790200000000-CreateCvSettingsAndAdmissionApproval's
    //    exact pattern. A fuller default role matrix (Principal/Head
    //    Teacher/etc.) is deferred: those role names are not confirmed to
    //    exist as fixed platform roles yet (see design spec Section 14 /
    //    Risk Analysis), so seeding permissions against them here would
    //    silently no-op or error depending on whether the role rows exist.
    // ------------------------------------------------------------------
    const permissions: Array<[string, string, string, string]> = [
      ['CV', 'TIMETABLE', 'CREATE', 'Create a Children\'s Village timetable (draft version)'],
      ['CV', 'TIMETABLE', 'READ', 'View Children\'s Village timetables'],
      ['CV', 'TIMETABLE', 'UPDATE', 'Edit a Children\'s Village timetable'],
      ['CV', 'TIMETABLE', 'PUBLISH', 'Publish a Children\'s Village timetable version'],
      ['CV', 'TIMETABLE', 'ARCHIVE', 'Archive or restore a Children\'s Village timetable version'],
      ['CV', 'TIMETABLE', 'APPROVE', 'Approve or reject a Children\'s Village timetable change'],
      ['CV', 'TIMETABLE', 'EMERGENCY_OVERRIDE', 'Force-publish a timetable bypassing configured approval'],
      ['CV', 'TEACHER_PROFILE', 'MANAGE', 'Manage teacher profiles, subject qualifications, and workload limits'],
      ['CV', 'TEACHER_AVAILABILITY', 'MANAGE', 'Record teacher availability (absence/leave/training/etc.) for other teachers'],
      ['CV', 'TEACHER_AVAILABILITY', 'READ', 'View teacher availability records'],
      ['CV', 'LESSON_COMPLETION', 'MANAGE', 'Mark or review lesson completion status'],
      ['CV', 'TIMETABLE_SETTINGS', 'MANAGE', 'Configure Timetable/Approval/Conflict settings for Children\'s Village'],
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
        SELECT id FROM permissions WHERE module_code = 'CV' AND resource IN
          ('TIMETABLE','TEACHER_PROFILE','TEACHER_AVAILABILITY','LESSON_COMPLETION','TIMETABLE_SETTINGS')
      );
      DELETE FROM permissions WHERE module_code = 'CV' AND resource IN
        ('TIMETABLE','TEACHER_PROFILE','TEACHER_AVAILABILITY','LESSON_COMPLETION','TIMETABLE_SETTINGS');
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "cv_timetable_approval_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_lesson_completion_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_teacher_availability"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_teacher_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_class_subject_teachers"`);

    await queryRunner.query(`
      ALTER TABLE "cv_calendar_events"
        DROP COLUMN IF EXISTS "timetable_behavior",
        DROP COLUMN IF EXISTS "affected_class_ids",
        DROP COLUMN IF EXISTS "affects_all_classes"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CV_TT_PERIODS_RESOURCE_SLOT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CV_TT_PERIODS_TEACHER_SLOT"`);
    await queryRunner.query(`
      ALTER TABLE "cv_timetable_periods" DROP CONSTRAINT IF EXISTS "FK_cv_timetable_periods_resource"
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_timetable_periods"
        DROP COLUMN IF EXISTS "period_number",
        DROP COLUMN IF EXISTS "notes",
        DROP COLUMN IF EXISTS "resource_id"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CV_TIMETABLES_CLASS_YEAR_TERM_STATUS"`);
    await queryRunner.query(`
      ALTER TABLE "cv_timetables" DROP CONSTRAINT IF EXISTS "FK_cv_timetables_superseded_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_timetables" DROP CONSTRAINT IF EXISTS "FK_cv_timetables_parent_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_timetables"
        DROP COLUMN IF EXISTS "superseded_by_id",
        DROP COLUMN IF EXISTS "change_type",
        DROP COLUMN IF EXISTS "published_by",
        DROP COLUMN IF EXISTS "published_at",
        DROP COLUMN IF EXISTS "effective_to",
        DROP COLUMN IF EXISTS "effective_from",
        DROP COLUMN IF EXISTS "parent_version_id",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "version"
    `);
  }
}
