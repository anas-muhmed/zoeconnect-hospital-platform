import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateIncidentNotificationRoles — adds incident-module-scoped notification
 * roles, distinct from platform RBAC roles (`roles`/`user_roles`).
 *
 * `incident_notification_roles`: the lookup list of role names (e.g.
 *   "RISK_MANAGER") that Severity Levels and Notification Rules target in
 *   their `notify_roles` jsonb arrays.
 * `incident_notification_role_members`: which users are currently assigned
 *   to each of those roles — the concrete recipients when a rule fires.
 *
 * Seeded with the same 7 default role names the frontend previously
 * hardcoded as free-text Autocomplete suggestions (no backing data), so
 * existing severity/rule configurations that already reference these names
 * resolve to real (initially empty) role rows instead of dangling strings.
 */
export class CreateIncidentNotificationRoles1787200000000 implements MigrationInterface {
  name = 'CreateIncidentNotificationRoles1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "incident_notification_roles" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"     UUID,
        "name"          VARCHAR(100) NOT NULL,
        "description"   TEXT,
        "is_active"     BOOLEAN NOT NULL DEFAULT TRUE,
        "display_order" INT NOT NULL DEFAULT 0,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_incident_notification_roles" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "UQ_incident_notif_roles_tenant_name"
        ON "incident_notification_roles" ("tenant_id", "name")
        WHERE "tenant_id" IS NOT NULL;
      CREATE INDEX "IDX_incident_notif_roles_tenant"
        ON "incident_notification_roles" ("tenant_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE TABLE "incident_notification_role_members" (
        "notification_role_id" UUID NOT NULL,
        "user_id"               UUID NOT NULL,
        CONSTRAINT "PK_incid_notif_role_members" PRIMARY KEY ("notification_role_id", "user_id"),
        CONSTRAINT "FK_incid_notif_role_members_role"
          FOREIGN KEY ("notification_role_id") REFERENCES "incident_notification_roles" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_incid_notif_role_members_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_incid_notif_role_members_role" ON "incident_notification_role_members" ("notification_role_id");
      CREATE INDEX "IDX_incid_notif_role_members_user" ON "incident_notification_role_members" ("user_id");
    `);

    // Seed the roles that were previously just hardcoded free-text
    // Autocomplete suggestions on the frontend, so existing severity/rule
    // configurations referencing these names resolve to real rows.
    await queryRunner.query(`
      INSERT INTO "incident_notification_roles" ("name", "description", "display_order") VALUES
        ('NURSE_MANAGER',          'Nursing unit escalation contact',      1),
        ('DEPARTMENT_HEAD',        'Department-level escalation contact',  2),
        ('RISK_MANAGER',           'Risk management oversight',            3),
        ('QUALITY_DIRECTOR',       'Quality & patient safety oversight',   4),
        ('CMO',                    'Chief Medical Officer',                5),
        ('CEO',                    'Chief Executive Officer',              6),
        ('PATIENT_SAFETY_OFFICER', 'Patient safety escalation contact',    7)
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_notification_role_members" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "incident_notification_roles" CASCADE;`);
  }
}
