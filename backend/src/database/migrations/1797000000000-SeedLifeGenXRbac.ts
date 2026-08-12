import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LifeGenX integration (ZoeConnect delivery phase).
 *
 * The source has NO meaningful authorization model to map: every route
 * only checked `authenticateJWT` (a valid token, any user) — there was
 * no role distinction at all (the Prisma `User.role` column always
 * defaulted to 'DOCTOR' and nothing ever branched on it). Per the
 * integration instructions ("if the source has no meaningful
 * authorization model, design the minimum appropriate permission model
 * using existing ZoeConnect patterns and clearly document the
 * decision"): this seeds a small LIFEGENX:* permission catalog and ONE
 * role, `LIFEGENX_CLINICIAN`, granted every LIFEGENX permission —
 * the minimum RBAC surface that reproduces "any authenticated clinician
 * can use every LifeGenX feature" without inventing role distinctions
 * the source never had. `HOSPITAL_ADMIN` gets the same full grant,
 * matching every prior module's precedent.
 *
 * Explicitly NOT ported from the source's own auth: its bcrypt/JWT
 * system, its demo-account auto-seeding (hardcoded `Password123!`), and
 * — most importantly — a live universal-password bypass in
 * `auth.controller.ts::login` (`if (!isMatch && validated.password !==
 * 'Password123!')` — meant to gate the demo account but written without
 * scoping it to that account, so `Password123!` authenticated as ANY
 * existing user). None of this exists in ZoeConnect's auth path at all;
 * flagged here for the record, not fixed in place, since it is dead
 * code the moment LifeGenX stops running its own auth system.
 */
export class SeedLifeGenXRbac1797000000000 implements MigrationInterface {
  name = 'SeedLifeGenXRbac1797000000000';

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

    const permissions: Array<{ resource: string; action: string }> = [
      { resource: 'CONSULTATIONS', action: 'CREATE' },
      { resource: 'CONSULTATIONS', action: 'VIEW' },
      { resource: 'AI', action: 'USE' },
      { resource: 'AUDIO', action: 'UPLOAD' },
    ];
    for (const p of permissions) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("id","module_code","resource","action")
         VALUES (gen_random_uuid(), 'LIFEGENX', $1, $2)
         ON CONFLICT ("module_code","resource","action") DO NOTHING`,
        [p.resource, p.action],
      );
    }

    await queryRunner.query(
      `INSERT INTO "roles" ("id","name","description","is_system","module_code","tenant_id")
       VALUES (gen_random_uuid(), 'LIFEGENX_CLINICIAN', 'LifeGenX clinician -- audio consultations, AI symptom extraction/diagnosis, ZoiBot (maps source''s single undifferentiated authenticated-user model)', false, 'LIFEGENX', $1)
       ON CONFLICT ("tenant_id","name") DO NOTHING`,
      [defaultTenantId],
    );

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'LIFEGENX'
      WHERE r.name IN ('LIFEGENX_CLINICIAN', 'HOSPITAL_ADMIN')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (SELECT id FROM permissions WHERE module_code = 'LIFEGENX')
    `);
    await queryRunner.query(`DELETE FROM roles WHERE module_code = 'LIFEGENX'`);
    await queryRunner.query(`DELETE FROM permissions WHERE module_code = 'LIFEGENX'`);
  }
}
