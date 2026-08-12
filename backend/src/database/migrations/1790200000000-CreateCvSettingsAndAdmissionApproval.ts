import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Children's Village -- admission-approval workflow (2026-08-03, requested
 * after a real gap was found: `cv_students.admission_status` defaults to
 * 'PENDING' and nothing in the module ever advanced it). Adds:
 *  - `cv_settings`: one row per tenant, `require_admission_approval` toggle.
 *  - `CV:SETTINGS:MANAGE`: gates reading/writing that toggle.
 *  - `CV:ADMISSIONS:APPROVE`: gates the new approve/reject actions on a
 *    pending admission (CvAdmissionsController).
 * Both permissions granted to SUPER_ADMIN and HOSPITAL_ADMIN only --
 * mirrors AddFeedbackAnalyticsPermission1783640000000's exact pattern.
 */
export class CreateCvSettingsAndAdmissionApproval1790200000000 implements MigrationInterface {
  name = 'CreateCvSettingsAndAdmissionApproval1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cv_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL UNIQUE,
        "require_admission_approval" boolean NOT NULL DEFAULT false,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" uuid NULL
      )
    `);

    // module_code is 'CV', NOT 'CHILDRENS_VILLAGE' -- that's the licensing
    // module_registry.code (a totally separate namespace checked by
    // LicenseGuard/@RequireModule) matching every other real CV permission
    // row (see 1789200000000-CreateChildrensVillagePhase1.ts,
    // 1789400000000-CreateCVStudentsPhase3.ts -- 'CV','ADMISSIONS','CREATE'
    // etc.). @RequirePermissions('CV:SETTINGS:MANAGE') on the controllers
    // checks this string verbatim (PermissionsGuard does no aliasing), so
    // this has to match that convention exactly, not the module_registry one.
    const permissions: Array<[string, string, string, string]> = [
      ['CV', 'SETTINGS',   'MANAGE', "Configure module-wide Children's Village settings (e.g. whether admissions require approval)"],
      ['CV', 'ADMISSIONS', 'APPROVE', 'Approve or reject a pending Children\'s Village admission'],
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
        SELECT id FROM permissions WHERE module_code = 'CV'
          AND ((resource = 'SETTINGS' AND action = 'MANAGE') OR (resource = 'ADMISSIONS' AND action = 'APPROVE'))
      );
      DELETE FROM permissions WHERE module_code = 'CV'
        AND ((resource = 'SETTINGS' AND action = 'MANAGE') OR (resource = 'ADMISSIONS' AND action = 'APPROVE'));
      DROP TABLE IF EXISTS "cv_settings";
    `);
  }
}
