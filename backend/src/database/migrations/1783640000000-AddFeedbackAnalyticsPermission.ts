import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patient Feedback -- Analytics Dashboard phase. No new tables (it's a
 * read-only aggregate view over feedback_submissions/feedback_complaints/
 * feedback_campaigns, all of which already exist), just the permission
 * gating the new `/feedback/analytics/*` routes, following the same
 * pattern as every other permission migration in this module.
 */
export class AddFeedbackAnalyticsPermission1783640000000 implements MigrationInterface {
  name = 'AddFeedbackAnalyticsPermission1783640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const permissions: Array<[string, string, string, string]> = [
      ['FEEDBACK', 'ANALYTICS', 'VIEW', 'View patient feedback analytics dashboard'],
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
        SELECT id FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'ANALYTICS'
      );
      DELETE FROM permissions WHERE module_code = 'FEEDBACK' AND resource = 'ANALYTICS';
    `);
  }
}
