import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

/**
 * Fixes a dormant permission gap and adds the service account needed for
 * direct HIS-to-HDSP token/MRN registration (see registration.service.ts).
 *
 * ── Part 1: missing permissions ─────────────────────────────────────────
 * RegistrationController guards 7 of its 8 routes with
 * 'TOKEN:REGISTRATION:VIEW' or 'TOKEN:REGISTRATION:ACTION'
 * (registration.controller.ts). Neither permission row was ever inserted --
 * migration 1751800000002 only seeded the four granular actions
 * (RESERVE / MAP_PATIENT / MAP_VISIT / SUPERVISOR_RESET). This has been
 * silently masked so far because PermissionsGuard short-circuits to `true`
 * for isCapabilityToken, isWorkstationToken, and isSuperAdmin callers
 * (permissions.guard.ts) -- exactly the three ways these routes have been
 * called until now (the popup/workstation-based widget, or admin testing).
 * A normal, fully-authenticated non-admin user (e.g. TOKEN_RECEPTIONIST,
 * TOKEN_SUPERVISOR, or the new his-integration service account below) hits
 * the real `user.hasPermission(perm)` check and would get a 403 today.
 *
 * ── Part 2: his-integration service account ─────────────────────────────
 * The new direct-registration flow (HIS backend calls
 * GET /token/registration/:tokenNumber/state and POST /token/map/patient
 * server-to-server, with no reservation/heartbeat step) needs a normal
 * HDSP login identity to authenticate as -- see the HIS integration
 * handoff doc. Created here with a random, unknown password
 * (mustChangePassword=true); an admin sets the real password afterward via
 * Admin > Users > Reset Password so it never lives in a migration file or
 * git history.
 */
export class AddRegistrationViewActionPermissions1783480000000
  implements MigrationInterface
{
  name = 'AddRegistrationViewActionPermissions1783480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Missing permissions ─────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("module_code","resource","action","description")
      VALUES
        ('TOKEN','REGISTRATION','VIEW',
         'View the registration queue and token/mapping state'),
        ('TOKEN','REGISTRATION','ACTION',
         'Reserve, heartbeat, release, and map tokens to patients during registration')
      ON CONFLICT ("module_code","resource","action") DO NOTHING
    `);

    // TOKEN_RECEPTIONIST + TOKEN_SUPERVISOR: grant VIEW + ACTION
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles"       r
      CROSS JOIN "permissions" p
      WHERE  r.name IN ('TOKEN_RECEPTIONIST','TOKEN_SUPERVISOR')
        AND  p.module_code = 'TOKEN'
        AND  p.resource    = 'REGISTRATION'
        AND  p.action IN ('VIEW','ACTION')
      ON CONFLICT DO NOTHING
    `);

    // SUPER_ADMIN + HOSPITAL_ADMIN: grant VIEW + ACTION too (consistent with
    // the other REGISTRATION permissions, and harmless -- isSuperAdmin
    // already bypasses the check, HOSPITAL_ADMIN does not)
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM   "roles"       r
      CROSS JOIN "permissions" p
      WHERE  r.name IN ('SUPER_ADMIN','HOSPITAL_ADMIN')
        AND  p.module_code = 'TOKEN'
        AND  p.resource    = 'REGISTRATION'
        AND  p.action IN ('VIEW','ACTION')
      ON CONFLICT DO NOTHING
    `);

    // ── 2. his-integration service account ─────────────────────────────
    const existing = await queryRunner.query(
      `SELECT "id" FROM "users" WHERE "username" = 'his-integration'`,
    );

    if (existing.length === 0) {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);

      const inserted = await queryRunner.query(
        `INSERT INTO "users"
           ("username","email","password_hash","full_name",
            "is_active","must_change_password")
         VALUES
           ('his-integration','his-integration@hdsp.local',$1,
            'HIS Integration (service account)', TRUE, TRUE)
         RETURNING "id"`,
        [passwordHash],
      );
      const userId: string = inserted[0].id;

      await queryRunner.query(
        `INSERT INTO "user_permissions" ("user_id","permission_id")
         SELECT $1, p.id
         FROM   "permissions" p
         WHERE  p.module_code = 'TOKEN'
           AND  p.resource    = 'REGISTRATION'
           AND  p.action IN ('VIEW','ACTION')`,
        [userId],
      );

      console.log(
        '  ▶ Created his-integration service account (username: his-integration). ' +
        'Its password is unknown/unusable by design -- set the real one via ' +
        'Admin > Users > Reset Password before wiring it into HIS.',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_permissions" up
      USING "users" u
      WHERE up.user_id = u.id AND u.username = 'his-integration'
    `);
    await queryRunner.query(`DELETE FROM "users" WHERE "username" = 'his-integration'`);

    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "permissions" p
      WHERE rp.permission_id = p.id
        AND p.module_code = 'TOKEN'
        AND p.resource    = 'REGISTRATION'
        AND p.action IN ('VIEW','ACTION')
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "module_code" = 'TOKEN' AND "resource" = 'REGISTRATION'
        AND "action" IN ('VIEW','ACTION')
    `);
  }
}
