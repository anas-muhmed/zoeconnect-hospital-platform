import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `seed-platform.ts` creates every system/module role (SUPER_ADMIN,
 * HOSPITAL_ADMIN, LOYALTY_OPERATOR, MARKETING_TEAM, MANAGEMENT,
 * EIC_THERAPIST, EIC_CENTRE_HEAD, TOKEN_OPERATOR) and every permission, but
 * never inserts a single `role_permissions` row — not even for SUPER_ADMIN.
 * The only place these mappings existed was three standalone, manually-run
 * SQL scripts (`patch-role-permissions.sql`, `patch-eic-permissions.sql`,
 * `patch-receptionist-role.sql`) that are not wired into `migration:run` at
 * all — a human has to know to run them by hand against each environment.
 * TOKEN_OPERATOR was never covered by any of the three patches and had zero
 * default permissions anywhere.
 *
 * Reported symptom this migration fixes: a user assigned the EIC_THERAPIST
 * role saw "No modules assigned yet" on login, because the role itself had
 * no permissions — a role assignment alone was not enough to get the
 * "basic permissions for that module" the role's name implies.
 *
 * This migration is the single automatic, idempotent (`ON CONFLICT DO
 * NOTHING`) source of truth for default role→permission assignment, folding
 * in the intent already captured by the three patch scripts above (kept in
 * `src/database/seeds/` for historical reference / manual DR use, but no
 * longer the only way to apply them) plus the previously-uncovered
 * TOKEN_OPERATOR role. `seed-platform.ts` is updated separately so fresh
 * installs don't reintroduce this gap either.
 */
export class BackfillDefaultRolePermissions1783820000000 implements MigrationInterface {
  name = 'BackfillDefaultRolePermissions1783820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── SUPER_ADMIN → every permission that exists ──────────────────────────
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'SUPER_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    // ── HOSPITAL_ADMIN → all PLATFORM + all EIC permissions ─────────────────
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code IN ('PLATFORM', 'EIC')
      WHERE r.name = 'HOSPITAL_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    // ── LOYALTY_OPERATOR → accounts / transactions / redemptions / card_config:read ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON (
        p.module_code = 'LOYALTY' AND (
             p.resource = 'ACCOUNTS'
          OR p.resource = 'TRANSACTIONS'
          OR p.resource = 'REDEMPTIONS'
          OR (p.resource = 'CARD_CONFIG' AND p.action = 'READ')
        )
      )
      WHERE r.name = 'LOYALTY_OPERATOR'
      ON CONFLICT DO NOTHING
    `);

    // ── MARKETING_TEAM → campaigns (all) + accounts:read + loyalty reports ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON (
        p.module_code = 'LOYALTY' AND (
             p.resource = 'CAMPAIGNS'
          OR p.resource = 'REPORTS'
          OR (p.resource = 'ACCOUNTS' AND p.action = 'READ')
        )
      )
      WHERE r.name = 'MARKETING_TEAM'
      ON CONFLICT DO NOTHING
    `);

    // ── MANAGEMENT → reports:read + audit_logs:read, across every module ────
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON (
           (p.resource = 'REPORTS'    AND p.action = 'READ')
        OR (p.resource = 'AUDIT_LOGS' AND p.action = 'READ')
      )
      WHERE r.name = 'MANAGEMENT'
      ON CONFLICT DO NOTHING
    `);

    // ── EIC_THERAPIST → all EIC except COUNTERSIGN / SIGN (supervisor-only) ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'EIC'
      WHERE r.name = 'EIC_THERAPIST'
        AND NOT (p.resource = 'ASSESSMENTS'      AND p.action = 'COUNTERSIGN')
        AND NOT (p.resource = 'PROGRESS_REPORTS' AND p.action = 'SIGN')
        AND NOT (p.resource = 'DISCHARGE'        AND p.action = 'SIGN')
      ON CONFLICT DO NOTHING
    `);

    // ── EIC_CENTRE_HEAD → all EIC permissions, including countersign/sign ───
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'EIC'
      WHERE r.name = 'EIC_CENTRE_HEAD'
      ON CONFLICT DO NOTHING
    `);

    // ── TOKEN_OPERATOR → all TOKEN permissions (never covered by any patch) ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'TOKEN'
      WHERE r.name = 'TOKEN_OPERATOR'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r
      WHERE rp.role_id = r.id
        AND r.name IN (
          'SUPER_ADMIN', 'HOSPITAL_ADMIN', 'LOYALTY_OPERATOR', 'MARKETING_TEAM',
          'MANAGEMENT', 'EIC_THERAPIST', 'EIC_CENTRE_HEAD', 'TOKEN_OPERATOR'
        )
    `);
  }
}
