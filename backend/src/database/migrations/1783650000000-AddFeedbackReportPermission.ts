import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Reports (CSV export) phase. No new tables, just the
 * permission gating `/feedback/reports/export/*`, same pattern as every
 * other permission-only migration in this module.
 */
export class AddFeedbackReportPermission1783650000000 implements MigrationInterface {
  name = 'AddFeedbackReportPermission1783650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'REPORT', 'VIEW', 'Export patient feedback reports (submissions, complaints, answers) as CSV'],
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
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'REPORT'
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'REPORT';
    `);
  }
}
