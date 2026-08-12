import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drug Indenting integration (delivery phase).
 *
 * Follows the exact precedent Mortuary's `1793000000000-SeedMortuaryRbac`
 * established: global `permissions` rows (module_code = 'DRUG_INDENTING'),
 * tenant-scoped `roles` rows for the 'default' tenant, `role_permissions`
 * grants, and a full `DRUG_INDENTING:*` grant for `HOSPITAL_ADMIN`.
 *
 * Source role -> ZoeConnect role mapping (from `utils/workflow.js`'s
 * ROLES + STAGE_APPROVER_ROLE, and `routes/requests.js`'s per-endpoint
 * `requireRole(...)` calls, both read in full):
 *   doctor       -> DRUG_DOCTOR        (creates requests only, never approves)
 *   hod          -> DRUG_HOD
 *   pharmacist   -> DRUG_PHARMACIST
 *   pharmacyhead -> DRUG_PHARMACY_HEAD
 *   dtccommittee -> DRUG_DTC_COMMITTEE (source alias 'dtc' handled at the
 *                    application layer by workflowRolesMatch(), not here)
 *   ceo          -> DRUG_CEO
 *   admin        -> HOSPITAL_ADMIN (reused, same as Mortuary's mapping —
 *                    no separate Drug-Indenting-specific admin identity)
 *
 * WORKFLOW:ACT_AS_<ROLE> permissions back `DrugIndentingRequestContext`'s
 * stage-approver check (see that file's doc comment) — these replace the
 * source's single `users.role` column read at request time.
 */
export class SeedDrugIndentingRbac1795000000000 implements MigrationInterface {
  name = 'SeedDrugIndentingRbac1795000000000';

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

    // ── Permissions (global, module_code = DRUG_INDENTING) ──
    const permissions: Array<{ resource: string; action: string }> = [
      { resource: 'REQUESTS', action: 'CREATE' },
      { resource: 'REQUESTS', action: 'VIEW' },
      { resource: 'REQUESTS', action: 'APPROVE' },
      { resource: 'REQUESTS', action: 'REJECT' },
      { resource: 'REQUESTS', action: 'CORRECT' },
      { resource: 'REQUESTS', action: 'REVERT' },
      { resource: 'REQUESTS', action: 'EMERGENCY_CREATE' },
      { resource: 'ALTERNATIVES', action: 'MANAGE' },
      { resource: 'DTC', action: 'FINAL_SELECT' },
      { resource: 'INVENTORY', action: 'MANAGE' },
      { resource: 'ORDER', action: 'PLACE' },
      { resource: 'QUOTA', action: 'VIEW' },
      { resource: 'QUOTA', action: 'MANAGE' },
      { resource: 'BLACKLIST', action: 'VIEW' },
      { resource: 'BLACKLIST', action: 'MANAGE' },
      { resource: 'WORKFLOW', action: 'ACT_AS_HOD' },
      { resource: 'WORKFLOW', action: 'ACT_AS_PHARMACIST' },
      { resource: 'WORKFLOW', action: 'ACT_AS_PHARMACY_HEAD' },
      { resource: 'WORKFLOW', action: 'ACT_AS_DTC_COMMITTEE' },
      { resource: 'WORKFLOW', action: 'ACT_AS_CEO' },
    ];
    for (const p of permissions) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("id","module_code","resource","action")
         VALUES (gen_random_uuid(), 'DRUG_INDENTING', $1, $2)
         ON CONFLICT ("module_code","resource","action") DO NOTHING`,
        [p.resource, p.action],
      );
    }

    // ── Roles (tenant-scoped, 'default' tenant) ──
    const roles: Array<{ name: string; desc: string }> = [
      { name: 'DRUG_DOCTOR', desc: 'Drug Indenting doctor — submits drug requests (maps source "doctor")' },
      { name: 'DRUG_HOD', desc: 'Drug Indenting Head of Department — first-stage approval (maps source "hod")' },
      { name: 'DRUG_PHARMACIST', desc: 'Drug Indenting pharmacist — initial review, alternatives analysis, order placement (maps source "pharmacist")' },
      { name: 'DRUG_PHARMACY_HEAD', desc: 'Drug Indenting pharmacy head — reviews pharmacist recommendations (maps source "pharmacyhead")' },
      { name: 'DRUG_DTC_COMMITTEE', desc: 'Drug Indenting DTC Committee — first-pass and final drug selection (maps source "dtccommittee"/"dtc")' },
      { name: 'DRUG_CEO', desc: 'Drug Indenting CEO — final approval before order placement (maps source "ceo")' },
    ];
    for (const r of roles) {
      await queryRunner.query(
        `INSERT INTO "roles" ("id","name","description","is_system","module_code","tenant_id")
         VALUES (gen_random_uuid(), $1, $2, false, 'DRUG_INDENTING', $3)
         ON CONFLICT ("tenant_id","name") DO NOTHING`,
        [r.name, r.desc, defaultTenantId],
      );
    }

    // ── HOSPITAL_ADMIN: full DRUG_INDENTING:* grant ──
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'DRUG_INDENTING'
      WHERE r.name = 'HOSPITAL_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    const grant = async (roleName: string, resource: string, action: string) => {
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r
         JOIN permissions p ON p.module_code = 'DRUG_INDENTING' AND p.resource = $1 AND p.action = $2
         WHERE r.name = $3
         ON CONFLICT DO NOTHING`,
        [resource, action, roleName],
      );
    };

    // DRUG_DOCTOR: create + view own requests + quota view + emergency create
    for (const [resource, action] of [
      ['REQUESTS', 'CREATE'], ['REQUESTS', 'VIEW'], ['REQUESTS', 'EMERGENCY_CREATE'], ['QUOTA', 'VIEW'],
    ]) await grant('DRUG_DOCTOR', resource, action);

    // DRUG_HOD: view + approve/reject at its stage
    for (const [resource, action] of [
      ['REQUESTS', 'VIEW'], ['REQUESTS', 'APPROVE'], ['REQUESTS', 'REJECT'], ['WORKFLOW', 'ACT_AS_HOD'],
    ]) await grant('DRUG_HOD', resource, action);

    // DRUG_PHARMACIST: view/approve/reject/correct/revert at its stages, alternatives, inventory, order placement
    for (const [resource, action] of [
      ['REQUESTS', 'VIEW'], ['REQUESTS', 'APPROVE'], ['REQUESTS', 'REJECT'],
      ['REQUESTS', 'CORRECT'], ['REQUESTS', 'REVERT'], ['REQUESTS', 'CREATE'],
      ['ALTERNATIVES', 'MANAGE'], ['INVENTORY', 'MANAGE'], ['ORDER', 'PLACE'],
      ['WORKFLOW', 'ACT_AS_PHARMACIST'],
    ]) await grant('DRUG_PHARMACIST', resource, action);

    // DRUG_PHARMACY_HEAD: view/approve/reject at its stages
    for (const [resource, action] of [
      ['REQUESTS', 'VIEW'], ['REQUESTS', 'APPROVE'], ['REQUESTS', 'REJECT'], ['WORKFLOW', 'ACT_AS_PHARMACY_HEAD'],
    ]) await grant('DRUG_PHARMACY_HEAD', resource, action);

    // DRUG_DTC_COMMITTEE: view/approve/reject, final selection, quota management, blacklist management
    for (const [resource, action] of [
      ['REQUESTS', 'VIEW'], ['REQUESTS', 'APPROVE'], ['REQUESTS', 'REJECT'],
      ['DTC', 'FINAL_SELECT'], ['QUOTA', 'VIEW'], ['QUOTA', 'MANAGE'],
      ['BLACKLIST', 'VIEW'], ['BLACKLIST', 'MANAGE'], ['WORKFLOW', 'ACT_AS_DTC_COMMITTEE'],
    ]) await grant('DRUG_DTC_COMMITTEE', resource, action);

    // DRUG_CEO: view/approve/reject at its stage
    for (const [resource, action] of [
      ['REQUESTS', 'VIEW'], ['REQUESTS', 'APPROVE'], ['REQUESTS', 'REJECT'], ['WORKFLOW', 'ACT_AS_CEO'],
    ]) await grant('DRUG_CEO', resource, action);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (SELECT id FROM permissions WHERE module_code = 'DRUG_INDENTING')
    `);
    await queryRunner.query(`DELETE FROM roles WHERE module_code = 'DRUG_INDENTING'`);
    await queryRunner.query(`DELETE FROM permissions WHERE module_code = 'DRUG_INDENTING'`);
  }
}
