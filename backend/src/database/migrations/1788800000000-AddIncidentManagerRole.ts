import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an INCIDENT_MANAGER role -- the Incident Management module
 * (1787000000000-CreateIncidentManagementSchema.ts) seeded its own
 * permissions (INCIDENT:INCIDENTS:*, INVESTIGATIONS:MANAGE, RCA:MANAGE,
 * CAPA:MANAGE/VERIFY, DASHBOARD:READ, SETTINGS:MANAGE) but only ever
 * granted them to SUPER_ADMIN and HOSPITAL_ADMIN -- unlike every other
 * licensed module (LOYALTY_OPERATOR/MARKETING_TEAM for Loyalty,
 * EIC_THERAPIST/EIC_CENTRE_HEAD for EIC, TOKEN_OPERATOR for Token Queue),
 * Incident Management never got its own operator-level role. Confirmed via
 * grep: no INCIDENT_MANAGER/INCIDENT_ADMIN/INCIDENT_HANDLER/etc. role
 * exists anywhere in seed-platform.ts or any migration. This is why the
 * "Map ... Role" dropdown on the Edit User dialog (a plain, unfiltered
 * passthrough of the `roles` table -- RolesService.findAll(), no
 * license/module filtering at all) never showed anything for Incident
 * Management: there was nothing to show, not a display bug.
 *
 * `roles` is tenant-scoped (unique on (tenant_id, name) -- Tenant-Scoped
 * User Identity Task 5 / AddTenantIdToAuthRbacTables1783740000000), so this
 * creates one INCIDENT_MANAGER row per EXISTING tenant rather than a
 * single global row, mirroring seed-platform.ts's per-tenant role creation
 * for a brand new install (that seed file is also updated alongside this
 * migration so a fresh `npm run seed` gets the same role without needing
 * this migration to run against it).
 *
 * Permission split mirrors the operator/admin split already used
 * elsewhere in this schema (TOKEN_OPERATOR vs *:MANAGE,
 * EIC_THERAPIST vs EIC_CENTRE_HEAD): INCIDENT_MANAGER gets every
 * day-to-day incident-workflow permission (report, view, edit, assign,
 * close, investigate, RCA, CAPA) but not INCIDENTS:DELETE or
 * SETTINGS:MANAGE (configuring categories/severity/risk matrix) -- those
 * stay reserved for SUPER_ADMIN/HOSPITAL_ADMIN.
 */
export class AddIncidentManagerRole1788800000000 implements MigrationInterface {
  name = 'AddIncidentManagerRole1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description", "is_system", "module_code", "tenant_id")
      SELECT gen_random_uuid(), 'INCIDENT_MANAGER',
             'Incident management operator -- reports, investigates, and closes incidents (cannot delete incidents or change module settings)',
             FALSE, 'INCIDENT', t."id"
      FROM "tenant" t
      ON CONFLICT ("tenant_id", "name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'INCIDENT_MANAGER'
        AND p.module_code = 'INCIDENT'
        AND NOT (p.resource = 'INCIDENTS' AND p.action = 'DELETE')
        AND NOT (p.resource = 'SETTINGS'  AND p.action = 'MANAGE')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'INCIDENT_MANAGER')
    `);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'INCIDENT_MANAGER'`);
  }
}
