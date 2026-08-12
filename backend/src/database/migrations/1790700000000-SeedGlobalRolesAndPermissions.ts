import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CRITICAL FIX (production incident, 2026-08): "ensure_global_roles" /
 * "ensure_global_permissions" (TenantProvisioningService's steps 3-4,
 * tenant-provisioning.service.ts:593-611) are pure VERIFICATION steps --
 * they check that the platform's global roles/permissions catalog already
 * exists and throw `platform is missing required global role(s): ...` if it
 * doesn't. The only thing that ever POPULATED that catalog was
 * `backend/src/database/seeds/seed-platform.ts`, a manual, one-time script
 * (`npm run seed`) documented only in setup guides -- it is NOT invoked by
 * this project's automated deploy pipeline. `docker-compose.yml`'s
 * hdsp-backend/frontend-worker containers run `typeorm/cli.js migration:run`
 * on every boot (both cloud and self-hosted), never `npm run seed`. Any
 * environment where migrations ran but the seed script was never manually
 * run hits `ensure_global_roles` failing on the very first real tenant
 * provisioning attempt -- exactly the reported incident.
 *
 * This migration closes that gap at its root: it seeds the SAME global
 * roles + a real (non-empty) permissions catalog `seed-platform.ts` does,
 * but through the one mechanism this pipeline's deploy already runs
 * automatically and identically in EVERY deployment mode (cloud AND
 * self-hosted) -- no deployment-specific branching needed, and no manual
 * step an operator can forget.
 *
 * DELIBERATELY DOES NOT create the bootstrap `superadmin` login account
 * `seed-platform.ts` also creates (that script's separate "Creating Super
 * Admin user" section, seed-platform.ts:301-363) -- that is a SEPARATE
 * concern from satisfying these two verification steps (see
 * `ensure_global_permissions`: `count === 0` is the only check; it never
 * inspects specific permission names, so a real, non-trivial catalog like
 * the one below is sufficient regardless of whether a bootstrap admin
 * account exists). Auto-creating a real login account with a hardcoded
 * password via an automatic migration, run unattended on every fresh
 * environment, is its own security decision this migration does not make
 * silently -- see `RESERVED_SYSTEM_USERNAMES`/`isReservedSystemUsername()`
 * in `tenant-provisioning.service.ts` (companion fix, same incident) for
 * the actual root-cause fix to the SEPARATE bug this conflation caused (a
 * tenant provisioning attempt permanently blocked from ever using the
 * username "superadmin", because that seed script's bootstrap account and
 * tenant-chosen admin usernames share one globally unique namespace -- see
 * that constant's own doc comment for the full incident writeup). That fix
 * lives in application code, not a migration, because it's validation
 * logic, not data. Operators who still want the manual bootstrap
 * `superadmin` account (e.g. a fresh self-hosted install with no tenant
 * provisioned yet at all) continue running `npm run seed` for that
 * specific purpose, unaffected by this migration -- `ON CONFLICT DO
 * NOTHING` below means running the old script afterward is still safe and
 * idempotent.
 *
 * Role/permission list and role_permissions grants copied verbatim from
 * seed-platform.ts (roles: lines 58-68, permissions: lines 87-150,
 * role_permissions: lines 169-259) -- this migration is a relocation of
 * that data into the automatic path, not a redesign; keep both in sync if
 * either ever changes (a mismatch is harmless -- both use `ON CONFLICT DO
 * NOTHING` against the same unique constraints -- but would leave stale,
 * unreachable rows in seed-platform.ts's own copy).
 */
export class SeedGlobalRolesAndPermissions1790700000000 implements MigrationInterface {
  name = 'SeedGlobalRolesAndPermissions1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Same invariant seed-platform.ts itself depends on (see that file's
    // own comment) -- migrations run in a fixed order, and
    // 1783710000000-SeedDefaultTenant.ts (which creates this row) always
    // runs before this migration's own later timestamp.
    const defaultTenantResult = await queryRunner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (defaultTenantResult.length === 0) {
      throw new Error(
        `Default tenant not found (SELECT * FROM "tenant" WHERE "code" = 'default' returned no rows) -- ` +
        `1783710000000-SeedDefaultTenant.ts should have already run before this migration.`,
      );
    }
    const defaultTenantId: string = defaultTenantResult[0].id;

    const roles: Array<{ name: string; desc: string; isSystem: boolean; module: string | null }> = [
      { name: 'SUPER_ADMIN', desc: 'Full system access', isSystem: true, module: null },
      { name: 'HOSPITAL_ADMIN', desc: 'Hospital administration access', isSystem: true, module: null },
      { name: 'LOYALTY_OPERATOR', desc: 'Loyalty card operations (enroll, earn, redeem)', isSystem: false, module: 'LOYALTY' },
      { name: 'MARKETING_TEAM', desc: 'Campaign and analytics access', isSystem: false, module: 'LOYALTY' },
      { name: 'MANAGEMENT', desc: 'Reports and dashboard access (read-only)', isSystem: false, module: null },
      { name: 'EIC_THERAPIST', desc: 'EIC therapist — create assessments & sessions', isSystem: false, module: 'EIC' },
      { name: 'EIC_CENTRE_HEAD', desc: 'EIC centre head — countersign & finalise records', isSystem: false, module: 'EIC' },
      { name: 'TOKEN_OPERATOR', desc: 'Token queue operator — calls tokens at a billing counter', isSystem: false, module: 'TOKEN' },
      { name: 'INCIDENT_MANAGER', desc: 'Incident management operator — reports, investigates, and closes incidents', isSystem: false, module: 'INCIDENT' },
    ];
    for (const r of roles) {
      await queryRunner.query(
        `INSERT INTO "roles" ("id","name","description","is_system","module_code","tenant_id")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT ("tenant_id","name") DO NOTHING`,
        [r.name, r.desc, r.isSystem, r.module, defaultTenantId],
      );
    }

    const permissions: Array<{ module: string; resource: string; action: string }> = [
      { module: 'PLATFORM', resource: 'AUTH', action: 'LOGIN' },
      { module: 'PLATFORM', resource: 'USERS', action: 'CREATE' },
      { module: 'PLATFORM', resource: 'USERS', action: 'READ' },
      { module: 'PLATFORM', resource: 'USERS', action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'USERS', action: 'DELETE' },
      { module: 'PLATFORM', resource: 'ROLES', action: 'MANAGE' },
      { module: 'PLATFORM', resource: 'SETTINGS', action: 'READ' },
      { module: 'PLATFORM', resource: 'SETTINGS', action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'AUDIT_LOGS', action: 'READ' },
      { module: 'PLATFORM', resource: 'LICENSE', action: 'MANAGE' },
      { module: 'PLATFORM', resource: 'HIS', action: 'READ' },
      { module: 'PLATFORM', resource: 'HIS', action: 'ADMIN' },
      { module: 'PLATFORM', resource: 'ROLES', action: 'READ' },
      { module: 'PLATFORM', resource: 'ROLES', action: 'CREATE' },
      { module: 'PLATFORM', resource: 'ROLES', action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'REPORTS', action: 'READ' },
      { module: 'PLATFORM', resource: 'ORG_BRANCHES', action: 'READ' },
      { module: 'PLATFORM', resource: 'ORG_BRANCHES', action: 'CREATE' },
      { module: 'PLATFORM', resource: 'ORG_BRANCHES', action: 'UPDATE' },
      { module: 'LOYALTY', resource: 'ACCOUNTS', action: 'CREATE' },
      { module: 'LOYALTY', resource: 'ACCOUNTS', action: 'READ' },
      { module: 'LOYALTY', resource: 'ACCOUNTS', action: 'UPDATE' },
      { module: 'LOYALTY', resource: 'TRANSACTIONS', action: 'CREATE' },
      { module: 'LOYALTY', resource: 'TRANSACTIONS', action: 'READ' },
      { module: 'LOYALTY', resource: 'REDEMPTIONS', action: 'CREATE' },
      { module: 'LOYALTY', resource: 'REDEMPTIONS', action: 'APPROVE' },
      { module: 'LOYALTY', resource: 'CAMPAIGNS', action: 'CREATE' },
      { module: 'LOYALTY', resource: 'CAMPAIGNS', action: 'READ' },
      { module: 'LOYALTY', resource: 'CAMPAIGNS', action: 'UPDATE' },
      { module: 'LOYALTY', resource: 'CARD_CONFIG', action: 'READ' },
      { module: 'LOYALTY', resource: 'CARD_CONFIG', action: 'UPDATE' },
      { module: 'LOYALTY', resource: 'REPORTS', action: 'READ' },
      { module: 'TOKEN', resource: 'COUNTER', action: 'OPERATE' },
      { module: 'TOKEN', resource: 'COUNTER', action: 'READ' },
      { module: 'TOKEN', resource: 'COUNTER', action: 'MANAGE' },
      { module: 'TOKEN', resource: 'DISPLAY', action: 'VIEW' },
      { module: 'EIC', resource: 'PATIENTS', action: 'READ' },
      { module: 'EIC', resource: 'PATIENTS', action: 'CREATE' },
      { module: 'EIC', resource: 'ENROLLMENTS', action: 'CREATE' },
      { module: 'EIC', resource: 'ASSESSMENTS', action: 'READ' },
      { module: 'EIC', resource: 'ASSESSMENTS', action: 'CREATE' },
      { module: 'EIC', resource: 'ASSESSMENTS', action: 'COUNTERSIGN' },
      { module: 'EIC', resource: 'SESSIONS', action: 'READ' },
      { module: 'EIC', resource: 'SESSIONS', action: 'CREATE' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'READ' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'CREATE' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'SIGN' },
      { module: 'EIC', resource: 'DISCHARGE', action: 'CREATE' },
      { module: 'EIC', resource: 'DISCHARGE', action: 'SIGN' },
      { module: 'EIC', resource: 'PRESCHOOL', action: 'READ' },
      { module: 'EIC', resource: 'PRESCHOOL', action: 'CREATE' },
    ];
    for (const p of permissions) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("id","module_code","resource","action")
         VALUES (gen_random_uuid(), $1, $2, $3)
         ON CONFLICT ("module_code","resource","action") DO NOTHING`,
        [p.module, p.resource, p.action],
      );
    }

    // role_permissions grants -- verbatim from seed-platform.ts:169-259.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'SUPER_ADMIN'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code IN ('PLATFORM', 'EIC')
      WHERE r.name = 'HOSPITAL_ADMIN'
      ON CONFLICT DO NOTHING
    `);
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
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'EIC'
      WHERE r.name = 'EIC_CENTRE_HEAD'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'TOKEN'
      WHERE r.name = 'TOKEN_OPERATOR'
      ON CONFLICT DO NOTHING
    `);
    // Same caveat seed-platform.ts documents at this exact point: INCIDENT
    // module permissions themselves come from
    // 1787000000000-CreateIncidentManagementSchema.ts, which (by timestamp)
    // already ran before this migration -- only the grant is repeated here.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'INCIDENT'
      WHERE r.name = 'INCIDENT_MANAGER'
        AND NOT (p.resource = 'INCIDENTS' AND p.action = 'DELETE')
        AND NOT (p.resource = 'SETTINGS'  AND p.action = 'MANAGE')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deliberately a no-op: these are shared, global catalog rows that may
    // already be depended on by real tenants/roles/users provisioned since
    // this migration ran (e.g. every SUPER_ADMIN's role_permissions grant).
    // Reversing a migration.run this far downstream in a live deployment is
    // far riskier than leaving idempotent, ON-CONFLICT-safe reference data
    // in place -- mirrors 1783710000000-SeedDefaultTenant.ts's own choice
    // to make its `down()` a real delete only because a tenant row has no
    // other real dependents by the time IT runs (this migration runs much
    // later, after real provisioning may have occurred).
  }
}
