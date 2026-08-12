import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Children's Village Timetable Management -- Phase 8 (Resources).
 *
 * The design spec (Section 3) originally proposed a brand new `cv_resources`
 * table for rooms/labs/therapy-spaces with a `maintenance_from`/
 * `maintenance_to` window. Phase 1 research found two pre-existing tables
 * that made that unsafe to build as specified:
 *
 *  - `cv_resources` already exists, for a DIFFERENT concept (loanable
 *    equipment/assets -- THERAPY_EQUIPMENT/AAC_DEVICE/SENSORY_AID/
 *    TEACHING_AID, tracked via `CvResourceManagementService`). Creating a
 *    second table with the same name was never viable; conflating rooms
 *    into the equipment table would have broken that service's `status`
 *    enum (AVAILABLE/IN_USE/MAINTENANCE/RETIRED) semantics for room booking.
 *  - `cv_classrooms` already exists for physical rooms (name, roomType,
 *    capacity, accessibilityFeatures, assignedTeacherId, isActive) and was
 *    confirmed via user sign-off in Phase 1 as the FK target for
 *    `cv_timetable_periods.resource_id`.
 *
 * `cv_classrooms` had no service/controller at all until this phase (only
 * the entity existed, wired solely as a relation target) -- a confirmed
 * gap: Phase 3's timetable API already lets an author set `resourceId` to
 * point at a classroom, but there was no way to actually manage the list of
 * classrooms. This migration adds the one piece of the original spec's
 * `cv_resources` design `cv_classrooms` was missing (the maintenance
 * window), additively.
 */
export class ExtendCvClassroomsForTimetabling1790600000000 implements MigrationInterface {
  name = 'ExtendCvClassroomsForTimetabling1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cv_classrooms"
        ADD COLUMN IF NOT EXISTS "maintenance_from" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "maintenance_to" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "maintenance_notes" text,
        ADD COLUMN IF NOT EXISTS "created_by" uuid,
        ADD COLUMN IF NOT EXISTS "updated_by" uuid
    `);

    const permissions: Array<[string, string, string, string]> = [
      ['CV', 'CLASSROOM', 'READ', 'View Children\'s Village classrooms/resources'],
      ['CV', 'CLASSROOM', 'MANAGE', 'Create, edit, and set maintenance windows for Children\'s Village classrooms/resources'],
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
        SELECT id FROM permissions WHERE module_code = 'CV' AND resource = 'CLASSROOM'
      );
      DELETE FROM permissions WHERE module_code = 'CV' AND resource = 'CLASSROOM';
    `);
    await queryRunner.query(`
      ALTER TABLE "cv_classrooms"
        DROP COLUMN IF EXISTS "maintenance_from",
        DROP COLUMN IF EXISTS "maintenance_to",
        DROP COLUMN IF EXISTS "maintenance_notes",
        DROP COLUMN IF EXISTS "created_by",
        DROP COLUMN IF EXISTS "updated_by"
    `);
  }
}
