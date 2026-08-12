import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 -- RBAC for the new
 * `organization_branches` REST surface (OrganizationBranchController).
 * Mirrors 1783420000000-AddTokenConfigReadPermission.ts's shape (seed a
 * permission row, then an explicit role_permissions grant) rather than
 * inventing a new pattern.
 *
 * Granted directly to SUPER_ADMIN/HOSPITAL_ADMIN -- the closest existing
 * roles to "Super Admin / Hospital Admin / Organization Admin" from the
 * task spec. This codebase has no distinct "Organization Admin" role today
 * (REQUIRED_GLOBAL_ROLES in tenant-provisioning.service.ts); HOSPITAL_ADMIN
 * is the existing tenant-level admin role and already receives every
 * PLATFORM-module permission via role_permissions rows keyed on
 * `p.module_code IN ('PLATFORM','EIC')` (see seed-platform.ts) -- these new
 * PLATFORM:ORG_BRANCHES:* permissions are picked up by that same bulk grant
 * for any FUTURE fresh install, but existing databases need this explicit
 * migration-time grant since seed-platform.ts only runs once.
 */
export class AddOrganizationBranchPermissions1788400000001 implements MigrationInterface {
  name = 'AddOrganizationBranchPermissions1788400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description") VALUES
        ('PLATFORM','ORG_BRANCHES','READ',   'View organization branches for the tenant'),
        ('PLATFORM','ORG_BRANCHES','CREATE', 'Create a new organization branch'),
        ('PLATFORM','ORG_BRANCHES','UPDATE', 'Update an organization branch')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT DISTINCT r.id, p.id
      FROM   "roles" r
      CROSS JOIN "permissions" p
      WHERE  p.module_code = 'PLATFORM' AND p.resource = 'ORG_BRANCHES'
        AND  r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT id FROM "permissions"
        WHERE "module_code" = 'PLATFORM' AND "resource" = 'ORG_BRANCHES'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module_code" = 'PLATFORM' AND "resource" = 'ORG_BRANCHES'
    `);
  }
}
