/**
 * Platform Seed — run ONCE on fresh installation.
 * Creates: system roles, permissions, module registry entries, default super admin.
 *
 * Run: npm run seed
 * WARNING: Do NOT run on a database that already has data.
 */
import { AppDataSource } from '../data-source';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const BCRYPT_ROUNDS = 12;

async function seed() {
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    // Tenant-Scoped User Identity, Task 1 (Data Hygiene Precondition) — see
    // TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md. Every identity row this
    // script creates (roles, super admin user) must be stamped with a real
    // tenant_id at insert time, not left NULL — a NULL-tenant row silently
    // evades composite uniqueness constraints (Postgres treats every NULL as
    // distinct in a unique index), which is exactly the gap
    // 1783860000000-BackfillTenantIdDataHygiene.ts exists to close for rows
    // that predate this fix. Migrations run before `npm run seed`, so the
    // 'default' tenant (seeded by 1783710000000-SeedDefaultTenant.ts) is
    // guaranteed to already exist here; fail loudly rather than silently
    // seeding NULL-tenant rows if that invariant is ever violated.
    const defaultTenantResult = await runner.query(
      `SELECT "id" FROM "tenant" WHERE "code" = 'default' LIMIT 1`,
    );
    if (defaultTenantResult.length === 0) {
      throw new Error(
        `Default tenant not found (SELECT * FROM "tenant" WHERE "code" = 'default' returned no rows). ` +
        `Run migrations before seeding -- the 'default' tenant is created by ` +
        `1783710000000-SeedDefaultTenant.ts, which must run first.`,
      );
    }
    const defaultTenantId: string = defaultTenantResult[0].id;

    console.log('▶ Seeding module_registry...');
    await runner.query(`
      INSERT INTO "module_registry" ("id","code","name","route","version","is_active","license_required","display_order","description") VALUES
        (gen_random_uuid(), 'PLATFORM', 'Platform Core',   '/platform',  '1.0.0', true,  false, 0, 'Core platform services'),
        (gen_random_uuid(), 'LOYALTY',  'Patient Loyalty', '/loyalty',   '1.0.0', false, true,  1, 'Patient loyalty card and rewards program'),
        (gen_random_uuid(), 'FORMS',    'Dynamic Forms',   '/forms',     '1.0.0', false, true,  2, 'Configurable digital forms'),
        (gen_random_uuid(), 'QUEUE',    'Queue Management','/queue',     '1.0.0', false, true,  3, 'Patient queue management system'),
        (gen_random_uuid(), 'FEEDBACK', 'Patient Feedback','/feedback',  '1.0.0', false, true,  4, 'Patient satisfaction surveys'),
        (gen_random_uuid(), 'CMS',      'Digital Signage', '/cms',       '1.0.0', false, true,  5, 'Digital signage and media management'),
        (gen_random_uuid(), 'TOKEN',    'Token Queue',     '/token',     '1.0.0', true,  false, 8, 'Hospital billing counter token queue management')
      ON CONFLICT ("code") DO NOTHING
    `);

    console.log('▶ Seeding roles...');
    const roles = [
      { name: 'SUPER_ADMIN',       desc: 'Full system access',                              is_system: true,  module: null  },
      { name: 'HOSPITAL_ADMIN',    desc: 'Hospital administration access',                   is_system: true,  module: null  },
      { name: 'LOYALTY_OPERATOR',  desc: 'Loyalty card operations (enroll, earn, redeem)',   is_system: false, module: 'LOYALTY' },
      { name: 'MARKETING_TEAM',    desc: 'Campaign and analytics access',                    is_system: false, module: 'LOYALTY' },
      { name: 'MANAGEMENT',        desc: 'Reports and dashboard access (read-only)',          is_system: false, module: null  },
      { name: 'EIC_THERAPIST',     desc: 'EIC therapist — create assessments & sessions',    is_system: false, module: 'EIC'   },
      { name: 'EIC_CENTRE_HEAD',   desc: 'EIC centre head — countersign & finalise records', is_system: false, module: 'EIC'   },
      { name: 'TOKEN_OPERATOR',    desc: 'Token queue operator — calls tokens at a billing counter', is_system: false, module: 'TOKEN' },
      { name: 'INCIDENT_MANAGER',  desc: 'Incident management operator — reports, investigates, and closes incidents', is_system: false, module: 'INCIDENT' },
    ];

    const roleIds: Record<string, string> = {};
    for (const r of roles) {
      const id = uuidv4();
      roleIds[r.name] = id;
      // Tenant-Scoped User Identity, Task 5: "roles" is now uniquely
      // constrained on (tenant_id, name), not bare (name) -- the ON CONFLICT
      // target must name both columns to match the live constraint exactly
      // (Postgres requires an exact match, not just "a" unique constraint on
      // a superset/subset of the given columns).
      await runner.query(
        `INSERT INTO "roles" ("id","name","description","is_system","module_code","tenant_id")
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("tenant_id","name") DO NOTHING`,
        [id, r.name, r.desc, r.is_system, r.module, defaultTenantId],
      );
    }

    console.log('▶ Seeding permissions...');
    const permissions = [
      // Auth
      { module: 'PLATFORM', resource: 'AUTH',           action: 'LOGIN' },
      { module: 'PLATFORM', resource: 'USERS',          action: 'CREATE' },
      { module: 'PLATFORM', resource: 'USERS',          action: 'READ' },
      { module: 'PLATFORM', resource: 'USERS',          action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'USERS',          action: 'DELETE' },
      { module: 'PLATFORM', resource: 'ROLES',          action: 'MANAGE' },
      { module: 'PLATFORM', resource: 'SETTINGS',       action: 'READ' },
      { module: 'PLATFORM', resource: 'SETTINGS',       action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'AUDIT_LOGS',     action: 'READ' },
      { module: 'PLATFORM', resource: 'LICENSE',        action: 'MANAGE' },
      // HIS Integration
      { module: 'PLATFORM', resource: 'HIS',            action: 'READ' },
      { module: 'PLATFORM', resource: 'HIS',            action: 'ADMIN' },
      { module: 'PLATFORM', resource: 'ROLES',          action: 'READ' },
      { module: 'PLATFORM', resource: 'ROLES',          action: 'CREATE' },
      { module: 'PLATFORM', resource: 'ROLES',          action: 'UPDATE' },
      { module: 'PLATFORM', resource: 'REPORTS',        action: 'READ' },
      // Organization Branch (ZoeConnect Identity Architecture Migration,
      // Phase 1) -- see 1788400000001-AddOrganizationBranchPermissions.ts,
      // kept in sync here so a fresh `npm run seed` install has these too.
      // No separate role_permissions insert needed: HOSPITAL_ADMIN's grant
      // below already covers every p.module_code = 'PLATFORM' permission,
      // and SUPER_ADMIN's grant covers everything.
      { module: 'PLATFORM', resource: 'ORG_BRANCHES',   action: 'READ' },
      { module: 'PLATFORM', resource: 'ORG_BRANCHES',   action: 'CREATE' },
      { module: 'PLATFORM', resource: 'ORG_BRANCHES',   action: 'UPDATE' },
      // Loyalty
      { module: 'LOYALTY',  resource: 'ACCOUNTS',       action: 'CREATE' },
      { module: 'LOYALTY',  resource: 'ACCOUNTS',       action: 'READ' },
      { module: 'LOYALTY',  resource: 'ACCOUNTS',       action: 'UPDATE' },
      { module: 'LOYALTY',  resource: 'TRANSACTIONS',   action: 'CREATE' },
      { module: 'LOYALTY',  resource: 'TRANSACTIONS',   action: 'READ' },
      { module: 'LOYALTY',  resource: 'REDEMPTIONS',    action: 'CREATE' },
      { module: 'LOYALTY',  resource: 'REDEMPTIONS',    action: 'APPROVE' },
      { module: 'LOYALTY',  resource: 'CAMPAIGNS',      action: 'CREATE' },
      { module: 'LOYALTY',  resource: 'CAMPAIGNS',      action: 'READ' },
      { module: 'LOYALTY',  resource: 'CAMPAIGNS',      action: 'UPDATE' },
      { module: 'LOYALTY',  resource: 'CARD_CONFIG',    action: 'READ' },
      { module: 'LOYALTY',  resource: 'CARD_CONFIG',    action: 'UPDATE' },
      { module: 'LOYALTY',  resource: 'REPORTS',        action: 'READ' },
      // Token Queue Management
      { module: 'TOKEN', resource: 'COUNTER', action: 'OPERATE' },
      { module: 'TOKEN', resource: 'COUNTER', action: 'READ'    },
      { module: 'TOKEN', resource: 'COUNTER', action: 'MANAGE'  },
      { module: 'TOKEN', resource: 'DISPLAY', action: 'VIEW'    },
      // EIC — Early Intervention Centre
      { module: 'EIC', resource: 'PATIENTS',         action: 'READ' },
      { module: 'EIC', resource: 'PATIENTS',         action: 'CREATE' },
      { module: 'EIC', resource: 'ENROLLMENTS',      action: 'CREATE' },
      { module: 'EIC', resource: 'ASSESSMENTS',      action: 'READ' },
      { module: 'EIC', resource: 'ASSESSMENTS',      action: 'CREATE' },
      { module: 'EIC', resource: 'ASSESSMENTS',      action: 'COUNTERSIGN' },
      { module: 'EIC', resource: 'SESSIONS',         action: 'READ' },
      { module: 'EIC', resource: 'SESSIONS',         action: 'CREATE' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'READ' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'CREATE' },
      { module: 'EIC', resource: 'PROGRESS_REPORTS', action: 'SIGN' },
      { module: 'EIC', resource: 'DISCHARGE',        action: 'CREATE' },
      { module: 'EIC', resource: 'DISCHARGE',        action: 'SIGN' },
      { module: 'EIC', resource: 'PRESCHOOL',        action: 'READ' },
      { module: 'EIC', resource: 'PRESCHOOL',        action: 'CREATE' },
    ];

    const permIds: Record<string, string> = {};
    for (const p of permissions) {
      const id = uuidv4();
      const key = `${p.module}:${p.resource}:${p.action}`;
      permIds[key] = id;
      await runner.query(
        `INSERT INTO "permissions" ("id","module_code","resource","action")
         VALUES ($1,$2,$3,$4) ON CONFLICT ("module_code","resource","action") DO NOTHING`,
        [id, p.module, p.resource, p.action],
      );
    }

    console.log('▶ Assigning default role_permissions...');
    // Mirrors migration 1783820000000-BackfillDefaultRolePermissions.ts —
    // kept in sync so a fresh `npm run seed` install doesn't reintroduce the
    // "role assigned but zero permissions" gap that migration backfills for
    // existing databases. See that migration's doc comment for full context.
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'SUPER_ADMIN'
      ON CONFLICT DO NOTHING
    `);
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code IN ('PLATFORM', 'EIC')
      WHERE r.name = 'HOSPITAL_ADMIN'
      ON CONFLICT DO NOTHING
    `);
    await runner.query(`
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
    await runner.query(`
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
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON (
           (p.resource = 'REPORTS'    AND p.action = 'READ')
        OR (p.resource = 'AUDIT_LOGS' AND p.action = 'READ')
      )
      WHERE r.name = 'MANAGEMENT'
      ON CONFLICT DO NOTHING
    `);
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'EIC'
      WHERE r.name = 'EIC_THERAPIST'
        AND NOT (p.resource = 'ASSESSMENTS'      AND p.action = 'COUNTERSIGN')
        AND NOT (p.resource = 'PROGRESS_REPORTS' AND p.action = 'SIGN')
        AND NOT (p.resource = 'DISCHARGE'        AND p.action = 'SIGN')
      ON CONFLICT DO NOTHING
    `);
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'EIC'
      WHERE r.name = 'EIC_CENTRE_HEAD'
      ON CONFLICT DO NOTHING
    `);
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'TOKEN'
      WHERE r.name = 'TOKEN_OPERATOR'
      ON CONFLICT DO NOTHING
    `);
    // Incident Management permissions themselves are seeded by migration
    // 1787000000000-CreateIncidentManagementSchema.ts (which runs before
    // this script, since migrations always run before `npm run seed`), not
    // by this file's own `permissions` array above -- only the role and its
    // grant need to be created here. Mirrors
    // 1788800000000-AddIncidentManagerRole.ts's split exactly: every
    // day-to-day incident permission except INCIDENTS:DELETE and
    // SETTINGS:MANAGE, which stay reserved for SUPER_ADMIN/HOSPITAL_ADMIN.
    await runner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r
      JOIN permissions p ON p.module_code = 'INCIDENT'
      WHERE r.name = 'INCIDENT_MANAGER'
        AND NOT (p.resource = 'INCIDENTS' AND p.action = 'DELETE')
        AND NOT (p.resource = 'SETTINGS'  AND p.action = 'MANAGE')
      ON CONFLICT DO NOTHING
    `);

    console.log('▶ Seeding card categories...');
    await runner.query(`
      INSERT INTO "card_categories"
        ("code","name","min_spend","max_spend","earn_rate_per_100","point_value_per_100","discount_thresholds","display_order","colour_hex")
      VALUES
        ('SILVER',   'Silver',   100000, 199999.99, 1.00, 25.00,
         '[{"min_value":300,"discount_pct":3}]',
         1, '#C0C0C0'),
        ('GOLD',     'Gold',     200000, 299999.99, 1.00, 50.00,
         '[{"min_value":300,"discount_pct":3},{"min_value":600,"discount_pct":6}]',
         2, '#FFD700'),
        ('PLATINUM', 'Platinum', 300000, null,       1.00, 75.00,
         '[{"min_value":300,"discount_pct":3},{"min_value":600,"discount_pct":6},{"min_value":900,"discount_pct":10}]',
         3, '#E5E4E2')
      ON CONFLICT ("code") DO NOTHING
    `);

    console.log('▶ Seeding default notification templates...');
    await runner.query(`
      INSERT INTO "notification_templates"
        ("name","event_type","channel","template_name","language_code","param_descriptions","body_preview")
      VALUES
        ('Card Enrolled',       'WELCOME',       'WHATSAPP', 'hdsp_welcome',       'en_US',
         '["card_type","card_number","patient_name"]',
         'Welcome to ZoeConnect Loyalty! Your {{card_type}} card is active. Card No: {{card_number}}.'),
        ('Points Earned',       'EARN_POINTS',   'WHATSAPP', 'hdsp_earn_points',   'en_US',
         '["patient_name","points","bill_amount","balance","card_value"]',
         'Hi {{patient_name}}, you earned {{points}} points on your visit (Bill: Rs.{{bill_amount}}).'),
        ('Points Redeemed',     'REDEEM_POINTS', 'WHATSAPP', 'hdsp_redeem_points', 'en_US',
         '["patient_name","points","value","balance"]',
         'Hi {{patient_name}}, {{points}} points (Rs.{{value}} value) were redeemed.'),
        ('Campaign Bonus',      'CAMPAIGN_BONUS','WHATSAPP', 'hdsp_campaign_bonus','en_US',
         '["patient_name","points","campaign_name"]',
         'Hi {{patient_name}}, you received {{points}} bonus points from {{campaign_name}}!'),
        ('License Expiry',      'ACCOUNT_EXPIRY_WARNING','EMAIL','hdsp_license_expiry','en_US',
         '["expiry_date","days_remaining"]',
         'ZoeConnect License expires on {{expiry_date}} ({{days_remaining}} days remaining).')
      ON CONFLICT ("event_type","channel") DO NOTHING
    `);

    console.log('▶ Creating Super Admin user...');
    const superAdminRoleResult = await runner.query(
      `SELECT "id" FROM "roles" WHERE "name" = 'SUPER_ADMIN' LIMIT 1`,
    );
    if (superAdminRoleResult.length > 0) {
      const roleId = superAdminRoleResult[0].id;
      const passwordHash = await bcrypt.hash('Admin@1234!', BCRYPT_ROUNDS);
      // ZoeConnect Identity Architecture Migration, Phase 4: "users" is now
      // uniquely constrained GLOBALLY (case-insensitive, via the
      // uq_users_username_ci / uq_users_email_ci functional indexes on
      // LOWER(username)/LOWER(email) -- see
      // 1788500000000-GlobalIdentityUniqueness.ts), not on (tenant_id,
      // username) as it briefly was under Tenant-Scoped User Identity Task
      // 5. A bare `ON CONFLICT DO NOTHING` (no explicit conflict target,
      // matching every other idempotent insert in this file) is used rather
      // than naming one specific index, since this single insert could
      // conflict on either the username index OR the email index -- ON
      // CONFLICT can only arbitrate one named target at a time, but no
      // target at all catches a violation of any unique constraint on the
      // table, which is the actual "skip if this exists already" intent
      // here.
      await runner.query(
        `INSERT INTO "users" ("username","email","password_hash","full_name","must_change_password","tenant_id")
         VALUES ('superadmin','admin@hdsp.local',$1,'Super Administrator',true,$2)
         ON CONFLICT DO NOTHING
      `,
        [passwordHash, defaultTenantId],
      );

      const userResult = await runner.query(
        `SELECT "id" FROM "users" WHERE "username" = 'superadmin' LIMIT 1`,
      );
      if (userResult.length > 0) {
         await runner.query(
           `INSERT INTO "user_roles" ("user_id", "role_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
           [userResult[0].id, roleId]
         );

         // Fix (2026-07-24, real UAT/self-hosted incident -- fresh install's
         // own superadmin showed "0 accounts" on the Users page). Same known
         // bug class already fixed once in AuthService.setupSuperAdmin()
         // (see that method's own doc comments, 2026-07-20, "MOSC"/"almas"
         // cloud tenants) -- but this installer's seed script creates the
         // superadmin via raw SQL, a completely separate path that never got
         // the same fix. UsersService.findAll() inner-joins user_branches
         // against the JWT's activeBranchId, which login() sets to the
         // synthetic DEFAULT_BRANCH_ID ('2', "Default Branch") whenever
         // BranchService.findAll() can't reach a real Oracle HIS yet --
         // exactly the state of every freshly installed self-hosted
         // instance before Oracle is configured. With no matching
         // user_branches row, that inner join silently excludes superadmin
         // from their own tenant's user list. Mirrors AuthService's fix at
         // the DB level (branch.service.ts's assignBranches() does the same
         // plain INSERT once Oracle is live in the app; this only needs to
         // seed the same row once, up front, not chase the synthetic ID
         // dynamically the way the app does, since a fresh DB has no other
         // branch rows yet).
         await runner.query(
           `INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, '2') ON CONFLICT DO NOTHING`,
           [userResult[0].id],
         );
      }
    }

    await runner.commitTransaction();
    console.log('✅ Seed completed successfully.');

  } catch (err) {
    await runner.rollbackTransaction();
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
