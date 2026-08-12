import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Children's Village Timetable Management -- Phase 7 (Teacher Requests:
 * Period Exchange, Mutual Swap, Substitute Assignment).
 *
 * Design spec Section 2.3-2.5 / 3 called for a unifying
 * `cv_timetable_change_requests` table (request_type discriminator
 * EXCHANGE/SWAP/SUBSTITUTE/PERMANENT_CHANGE) plus an `approval_instance_id`
 * FK into the workflow engine. Two adjustments from the original spec,
 * consistent with decisions already made in Phases 1 and 6:
 *
 *  1. `approval_instance_id` points at Phase 6's own tenant-scoped
 *     `cv_timetable_workflow_instances` table, not
 *     `hdsp_document_workflow_instances` -- same tenant-isolation reasoning
 *     as the Phase 6 migration.
 *  2. PERMANENT_CHANGE is deliberately NOT a request_type here.
 *     Section 2.6's "permanent change" flow is just Phase 2's existing
 *     cloneForEdit() -> submit -> publish cycle (already shipped, already
 *     approval-gated by Phase 6) with a `changeType` tag on the new
 *     `CvTimetable` version -- it doesn't need its own request record. This
 *     table only covers the three request types that do NOT go through a
 *     new timetable version: exchange/swap/substitute apply as single-date
 *     overrides.
 *
 * Also extends `cv_timetable_period_overrides` (existing table, live in
 * `updatePeriod()`/`getTeacherScheduleForDay()`) with three nullable
 * columns so an approved exchange/swap/substitute can be recorded for one
 * calendar date without touching the recurring template: `teacher_id` (the
 * substitute/incoming teacher for that date), `original_teacher_id` (who
 * they're replacing, for display + rollback), `change_request_id` (links
 * back to the request that created it, for rollback). All three are
 * nullable and additive -- existing THIS_DAY room/time-only overrides
 * (created by the live teacher-workspace inline-edit flow) are completely
 * unaffected; only rows a Phase 7 write path actually populates will have
 * these columns set.
 */
export class CreateCvTimetableChangeRequests1790500000000 implements MigrationInterface {
  name = 'CreateCvTimetableChangeRequests1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cv_timetable_period_overrides"
        ADD COLUMN IF NOT EXISTS "teacher_id" uuid,
        ADD COLUMN IF NOT EXISTS "original_teacher_id" uuid,
        ADD COLUMN IF NOT EXISTS "change_request_id" uuid
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_timetable_change_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "request_type" varchar(20) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING_COUNTERPARTY',
        "class_id" uuid,
        "initiating_teacher_id" uuid NOT NULL,
        "counterparty_teacher_id" uuid,
        "original_period_id" uuid NOT NULL,
        "counterparty_period_id" uuid,
        "substitute_teacher_id" uuid,
        "affected_date_start" date NOT NULL,
        "affected_date_end" date,
        "reason" text,
        "approval_instance_id" uuid,
        "resulting_override_ids" uuid[],
        "decline_reason" text,
        "block_reason" text,
        "rolled_back_at" TIMESTAMP,
        "rolled_back_by" uuid,
        "rollback_reason" text,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_change_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_tt_change_requests_original_period" FOREIGN KEY ("original_period_id")
          REFERENCES "cv_timetable_periods"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_cv_tt_change_requests_counterparty_period" FOREIGN KEY ("counterparty_period_id")
          REFERENCES "cv_timetable_periods"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_cv_tt_change_requests_approval_instance" FOREIGN KEY ("approval_instance_id")
          REFERENCES "cv_timetable_workflow_instances"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_CHANGE_REQ_TENANT_STATUS" ON "cv_timetable_change_requests" ("tenant_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_CHANGE_REQ_INITIATOR" ON "cv_timetable_change_requests" ("initiating_teacher_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_CHANGE_REQ_COUNTERPARTY" ON "cv_timetable_change_requests" ("counterparty_teacher_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_CHANGE_REQ_ORIGINAL_PERIOD" ON "cv_timetable_change_requests" ("original_period_id")
    `);

    // One new permission for admin-only substitute-assignment creation and
    // rollback -- exchange/swap creation stays ownership-gated (no
    // permission required), matching how `updatePeriod` on the live
    // teacher-workspace controller already works (see
    // cv-teacher-workspace.controller.ts's doc comment).
    await queryRunner.query(
      `INSERT INTO permissions (module_code, resource, action, description)
       VALUES ('CV','TEACHER_REQUEST','MANAGE','Assign substitute teachers and roll back completed teacher requests')
       ON CONFLICT (module_code, resource, action) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
         AND p.module_code='CV' AND p.resource='TEACHER_REQUEST' AND p.action='MANAGE'
       ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions WHERE permission_id IN (
        SELECT id FROM permissions WHERE module_code = 'CV' AND resource = 'TEACHER_REQUEST' AND action = 'MANAGE'
      );
      DELETE FROM permissions WHERE module_code = 'CV' AND resource = 'TEACHER_REQUEST' AND action = 'MANAGE';
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_timetable_change_requests"`);
    await queryRunner.query(`
      ALTER TABLE "cv_timetable_period_overrides"
        DROP COLUMN IF EXISTS "teacher_id",
        DROP COLUMN IF EXISTS "original_teacher_id",
        DROP COLUMN IF EXISTS "change_request_id"
    `);
  }
}
