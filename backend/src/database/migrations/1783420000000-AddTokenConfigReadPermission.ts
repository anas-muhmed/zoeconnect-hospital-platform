import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes a permission gap that made the Join Counter screen show the wrong
 * (stale/default) issuance mode for TOKEN_OPERATOR users.
 *
 * Bug: `GET /token/config` and `GET /token/config/mode`
 * (backend/src/modules/token/config/token-config.controller.ts:34-44) are
 * guarded by `TOKEN:CONFIG:READ`. That permission was never seeded --
 * migration 1751300000000-TokenArchitecturePhase1 only ever inserted
 * `TOKEN:CONFIG:WRITE`, and only granted it (via a resource-based bulk
 * grant) to SUPER_ADMIN/HOSPITAL_ADMIN, never to TOKEN_OPERATOR. So every
 * non-superadmin request to read the branch's current mode either 403s
 * (PermissionsGuard rejects a permission string with no matching row) or
 * is denied outright, and the frontend's `useQuery(['token-branch-config'])`
 * (frontend/src/app/(platform)/token/page.tsx) silently falls back to its
 * hardcoded `'LOCATION_BASED'` default -- so a TOKEN_OPERATOR keeps seeing
 * the Location-Based "Join a Billing Counter" panel even after a superadmin
 * switches the branch to Service Center Based and the mode-changed socket
 * event fires correctly (the event just re-triggers the same failing fetch).
 *
 * SUPER_ADMIN itself was never actually blocked -- PermissionsGuard grants
 * `isSuperAdmin` an unconditional bypass
 * (backend/src/common/guards/permissions.guard.ts:41) -- which is exactly
 * why this was invisible during admin testing and only showed up for an
 * operator account.
 */
export class AddTokenConfigReadPermission1783420000000 implements MigrationInterface {
  name = 'AddTokenConfigReadPermission1783420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description") VALUES
        ('TOKEN','CONFIG','READ','View branch token issuance mode/config')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    // Grant to SUPER_ADMIN/HOSPITAL_ADMIN explicitly (matches the intent of
    // migration 1751300000000's resource-based CONFIG grant, which predates
    // this permission and therefore missed it), plus any role -- present or
    // future -- that already holds an operator-level TOKEN permission
    // (OPERATE/READ/VIEW), so any counter-facing role automatically gets
    // read access to the mode it needs to render correctly, without having
    // to hardcode every such role name here.
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT DISTINCT r.id, p.id
      FROM   "roles" r
      CROSS JOIN "permissions" p
      WHERE  p.module_code = 'TOKEN' AND p.resource = 'CONFIG' AND p.action = 'READ'
        AND (
          r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
          OR EXISTS (
            SELECT 1
            FROM   "role_permissions" rp
            JOIN   "permissions" p2 ON p2.id = rp.permission_id
            WHERE  rp.role_id = r.id
              AND  p2.module_code = 'TOKEN'
              AND  p2.action IN ('OPERATE','READ','VIEW')
          )
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT id FROM "permissions"
        WHERE "module_code" = 'TOKEN' AND "resource" = 'CONFIG' AND "action" = 'READ'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module_code" = 'TOKEN' AND "resource" = 'CONFIG' AND "action" = 'READ'
    `);
  }
}
