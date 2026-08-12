import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage D).
 *
 * Seeds the MORTUARY:* permission catalog and role grants, following the
 * exact precedent `1790700000000-SeedGlobalRolesAndPermissions.ts` already
 * established for EIC/TOKEN/INCIDENT: new global `permissions` rows (no
 * `tenant_id` — confirmed by reading that table's actual seed data, every
 * existing permission is unscoped), two new tenant-scoped `roles` rows
 * seeded for the 'default' tenant (same scope as every other role that
 * migration seeds), and `role_permissions` grants — `HOSPITAL_ADMIN` gets
 * every `MORTUARY:*` permission (same pattern as that role's existing
 * `PLATFORM`/`EIC` grant), matching Stage D's decision to map Mortuary's
 * original 'Admin' role onto ZoeConnect's existing tenant admin role
 * rather than invent a separate Mortuary admin identity.
 *
 * Derived from the ORIGINAL zoe-platform Mortuary route/role matrix (every
 * router file's `authorize(...)` calls, read in full — see Stage D
 * report's §2/§3 for the complete old-role -> new-permission derivation),
 * not invented. One deliberate, flagged departure from literal source
 * parity: the source's 'House Keeping' role had IDENTICAL access to
 * 'M Staff' everywhere (both always appear together in every
 * `authorize('M Staff', 'House Keeping', ...)` call — verified, there is
 * no endpoint anywhere that distinguishes them). `MORTUARY_HOUSEKEEPING`
 * here is deliberately narrowed to housekeeping-only permissions instead
 * of mirroring that flat grouping — see Stage D report for the explicit
 * rationale and the request for confirmation.
 */
export class SeedMortuaryRbac1793000000000 implements MigrationInterface {
  name = 'SeedMortuaryRbac1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const defaultTenantResult = await queryRunner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (defaultTenantResult.length === 0) {
      throw new Error(
        `Default tenant not found -- 1783710000000-SeedDefaultTenant.ts should have already run before this migration.`,
      );
    }
    const defaultTenantId: string = defaultTenantResult[0].id;

    // ── Permissions (global, no tenant_id — matches existing catalog) ────
    const permissions: Array<{ resource: string; action: string }> = [
      { resource: 'BODIES', action: 'READ' },
      { resource: 'BODIES', action: 'CREATE' },
      { resource: 'BODIES', action: 'UPDATE' },
      { resource: 'BODIES', action: 'DELETE' },
      { resource: 'CONCESSION_AUTHORITIES', action: 'READ' },
      { resource: 'CONCESSION_AUTHORITIES', action: 'MANAGE' },
      { resource: 'CABINS', action: 'READ' },
      { resource: 'CABINS', action: 'MANAGE' },
      { resource: 'ALLOCATIONS', action: 'READ' },
      { resource: 'ALLOCATIONS', action: 'CREATE' },
      { resource: 'ALLOCATIONS', action: 'RELEASE' },
      { resource: 'ALLOCATIONS', action: 'EXTEND' },
      { resource: 'ALLOCATIONS', action: 'OVERRIDE_ADVANCE' },
      { resource: 'BILLING', action: 'READ' },
      { resource: 'BILLING', action: 'MANAGE' },
      { resource: 'BILLING', action: 'OVERRIDE_CHARGE' },
      { resource: 'SERVICE_MASTER', action: 'READ' },
      { resource: 'SERVICE_MASTER', action: 'MANAGE' },
      { resource: 'RELEASES', action: 'READ' },
      { resource: 'RELEASES', action: 'CREATE' },
      { resource: 'HOUSEKEEPING', action: 'READ' },
      { resource: 'HOUSEKEEPING', action: 'MANAGE' },
      { resource: 'SETTINGS', action: 'READ' },
      { resource: 'SETTINGS', action: 'MANAGE' },
    ];
    for (const p of permissions) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("id","module_code","resource","action")
         VALUES (gen_random_uuid(), 'MORTUARY', $1, $2)
         ON CONFLICT ("module_code","resource","action") DO NOTHING`,
        [p.resource, p.action],
      );
    }

    // ── Roles (tenant-scoped, 'default' tenant — same scope as the EIC/TOKEN/INCIDENT precedent) ──
    const roles: Array<{ name: string; desc: string }> = [
      { name: 'MORTUARY_STAFF', desc: 'Mortuary staff — body registration, cabin allocation, billing, releases (maps zoe-platform\'s "M Staff")' },
      { name: 'MORTUARY_HOUSEKEEPING', desc: 'Mortuary housekeeping — cabin cleaning task management only' },
    ];
    for (const r of roles) {
      await queryRunner.query(
        `INSERT INTO "roles" ("id","name","description","is_system","module_code","tenant_id")
         VALUES (gen_random_uuid(), $1, $2, false, 'MORTUARY', $3)
         ON CONFLICT ("tenant_id","name") DO NOTHING`,
        [r.name, r.desc, defaultTenantId],
      );
    }

    // ── HOSPITAL_ADMIN: full MORTUARY:* grant (Mortuary's original 'Admin' + 'SuperAdmin'-minus-cross-tenant) ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'MORTUARY'
      WHERE r.name = 'HOSPITAL_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    // ── MORTUARY_STAFF: explicit grant list, NOT a blanket action-name
    // exclusion filter. An earlier draft of this migration excluded every
    // permission whose action was literally named 'MANAGE' — which
    // incorrectly withheld MORTUARY:BILLING:MANAGE too, even though
    // billingRoutes.js's STAFF-tier group (M Staff + House Keeping + Admin
    // + SuperAdmin) could generate/settle bills; only the body-dressing
    // CHARGE override was admin-only. 'MANAGE' is not a reliable admin-only
    // signal across every resource — verified against the source per
    // resource instead. Caught by this stage's own live-DB grant-count
    // verification (see Stage D report).
    const staffGrants: Array<{ resource: string; action: string }> = [
      { resource: 'BODIES', action: 'READ' },
      { resource: 'BODIES', action: 'CREATE' },
      { resource: 'BODIES', action: 'UPDATE' },
      { resource: 'CONCESSION_AUTHORITIES', action: 'READ' },
      { resource: 'CABINS', action: 'READ' },
      { resource: 'ALLOCATIONS', action: 'READ' },
      { resource: 'ALLOCATIONS', action: 'CREATE' },
      { resource: 'ALLOCATIONS', action: 'RELEASE' },
      { resource: 'ALLOCATIONS', action: 'EXTEND' },
      { resource: 'BILLING', action: 'READ' },
      { resource: 'BILLING', action: 'MANAGE' },
      { resource: 'SERVICE_MASTER', action: 'READ' },
      { resource: 'RELEASES', action: 'READ' },
      { resource: 'RELEASES', action: 'CREATE' },
      { resource: 'SETTINGS', action: 'READ' },
      // HOUSEKEEPING:READ/MANAGE — the source's flat STAFF group (M Staff +
      // House Keeping) always included full housekeeping access; preserved
      // here for the M-Staff-mapped role (see this migration's own doc
      // comment for why the HOUSEKEEPING role itself is narrowed instead).
      { resource: 'HOUSEKEEPING', action: 'READ' },
      { resource: 'HOUSEKEEPING', action: 'MANAGE' },
    ];
    for (const g of staffGrants) {
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r
         JOIN permissions p ON p.module_code = 'MORTUARY' AND p.resource = $1 AND p.action = $2
         WHERE r.name = 'MORTUARY_STAFF'
         ON CONFLICT DO NOTHING`,
        [g.resource, g.action],
      );
    }

    // ── MORTUARY_HOUSEKEEPING: housekeeping only ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'MORTUARY' AND p.resource = 'HOUSEKEEPING'
      WHERE r.name = 'MORTUARY_HOUSEKEEPING'
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (SELECT id FROM permissions WHERE module_code = 'MORTUARY')
    `);
    await queryRunner.query(`DELETE FROM roles WHERE module_code = 'MORTUARY'`);
    await queryRunner.query(`DELETE FROM permissions WHERE module_code = 'MORTUARY'`);
  }
}
