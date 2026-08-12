import { execSync } from 'child_process';
// @ts-ignore
import { Client } from 'pg';
import path from 'path';
// No need for ESM shim in CommonJS

async function globalSetup() {
  console.log('Setting up E2E environment...');

  // 1. Create the dedicated E2E database if it doesn't exist
  const client = new Client({
    connectionString: 'postgres://hdsp_app:dev_password_change_in_prod@localhost:5432/postgres'
  });

  try {
    await client.connect();
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'hdsp_db_e2e'`);
    if (res.rowCount === 0) {
      console.log('Creating database hdsp_db_e2e...');
      await client.query(`CREATE DATABASE hdsp_db_e2e`);
    } else {
      console.log('Database hdsp_db_e2e already exists. Dropping public schema for a clean slate...');
      // To drop public schema, we need to connect to the actual db
      const e2eClient = new Client({
        connectionString: 'postgres://hdsp_app:dev_password_change_in_prod@localhost:5432/hdsp_db_e2e'
      });
      await e2eClient.connect();
      await e2eClient.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await e2eClient.end();
    }
  } catch (error: any) {
    console.warn('Could not create/reset E2E DB directly (maybe permission issue or DB does not exist). Attempting to proceed anyway.', error.message);
  } finally {
    await client.end();
  }

  // 2. Run TypeORM migrations on the E2E database
  console.log('Running backend migrations on E2E database...');
  const backendDir = path.resolve(__dirname, '../../backend');
  try {
    execSync('npm run migration:run', {
      cwd: backendDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DB_NAME: 'hdsp_db_e2e',
        TS_NODE_CACHE: 'false'
      }
    });
    console.log('Migrations complete.');


    console.log('Seeding E2E database...');
    execSync('npm run seed', {
      cwd: backendDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DB_NAME: 'hdsp_db_e2e'
      }
    });

    console.log('Creating E2E personas and roles in database...');
    const e2eClient = new Client({
      connectionString: 'postgres://hdsp_app:dev_password_change_in_prod@localhost:5432/hdsp_db_e2e'
    });
    await e2eClient.connect();
    
    // 1. Get default tenant
    const resTenant = await e2eClient.query(`SELECT id FROM tenant WHERE code = 'default'`);
    const defaultTenantId = resTenant.rows[0].id;

    // 2. Create roles for Incident Management
    await e2eClient.query(`
      INSERT INTO roles (id, tenant_id, name, description, is_system) VALUES 
      (gen_random_uuid(), $1, 'INCIDENT_REPORTER', 'Can report incidents', false),
      (gen_random_uuid(), $1, 'INCIDENT_INVESTIGATOR', 'Can investigate and RCA', false),
      (gen_random_uuid(), $1, 'INCIDENT_QUALITY_MANAGER', 'Can verify and close', false)
      ON CONFLICT DO NOTHING;
    `, [defaultTenantId]);

    // 3. Assign permissions to roles
    await e2eClient.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'INCIDENT_REPORTER' AND p.module_code = 'INCIDENT' AND p.resource = 'INCIDENTS' AND p.action IN ('CREATE', 'READ');
      
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'INCIDENT_INVESTIGATOR' AND p.module_code = 'INCIDENT' AND p.resource IN ('INCIDENTS', 'INVESTIGATIONS', 'RCA', 'CAPA') AND p.action IN ('READ', 'UPDATE', 'MANAGE');

      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'INCIDENT_QUALITY_MANAGER' AND p.module_code = 'INCIDENT';
    `);

    // 4. Create Users (password is 'password' -> hashed)
    // We use a pre-calculated valid bcrypt hash for 'password'.
    const passwordHash = '$2b$12$b5/52Ov2kUpiyE/ibmyi.uCvAxfaOmJSPy.g.UwRcz0Bs0qh15K9y';
    
    await e2eClient.query(`
      INSERT INTO users (id, tenant_id, username, password_hash, email, full_name, is_active) VALUES
      (gen_random_uuid(), $1, 'reporter', $2, 'reporter@test.com', 'Test Reporter', true),
      (gen_random_uuid(), $1, 'investigator', $2, 'investigator@test.com', 'Test Investigator', true),
      (gen_random_uuid(), $1, 'qm', $2, 'qm@test.com', 'Test Quality Manager', true),
      (gen_random_uuid(), $1, 'admin', $2, 'admin@test.com', 'Test Hospital Admin', true)
      ON CONFLICT DO NOTHING;
    `, [defaultTenantId, passwordHash]);

    // Force update passwords just in case they were created previously with a bad hash
    await e2eClient.query(`
      UPDATE users SET password_hash = $1 WHERE username IN ('reporter', 'investigator', 'qm', 'admin');
    `, [passwordHash]);

    // Assign roles to users
    await e2eClient.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'reporter' AND r.name = 'INCIDENT_REPORTER'
      UNION
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'investigator' AND r.name = 'INCIDENT_INVESTIGATOR'
      UNION
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'qm' AND r.name = 'INCIDENT_QUALITY_MANAGER'
      UNION
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'admin' AND r.name = 'HOSPITAL_ADMIN';
    `);

    
    // We can hardcode tenantBId since we insert it explicitly below
    const tenantBId = 'b0000000-0000-0000-0000-000000000000';
    await e2eClient.query(`
      INSERT INTO tenant (id, name, code, status, subdomain) VALUES ($1, 'Tenant B', 'tenant_b', 'active', 'tenant-b') ON CONFLICT DO NOTHING;
    `, [tenantBId]);
    await e2eClient.query(`
      INSERT INTO users (id, tenant_id, username, password_hash, email, full_name, is_active) VALUES
      (gen_random_uuid(), $1, 'tenant_b_user', $2, 'b@test.com', 'Tenant B User', true)
      ON CONFLICT DO NOTHING;
    `, [tenantBId, passwordHash]);

    // Force update password just in case
    await e2eClient.query(`
      UPDATE users SET password_hash = $1 WHERE username = 'tenant_b_user';
    `, [passwordHash]);
    // Give tenant B user hospital admin role (so they can try to access Tenant A data)
    await e2eClient.query(`
      INSERT INTO roles (id, tenant_id, name, description, is_system) VALUES 
      (gen_random_uuid(), $1, 'HOSPITAL_ADMIN', 'Hospital Admin', true) ON CONFLICT DO NOTHING;
    `, [tenantBId]);
    await e2eClient.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.tenant_id = $1 AND r.name = 'HOSPITAL_ADMIN' AND p.module_code = 'INCIDENT';
    `, [tenantBId]);
    await e2eClient.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u, roles r
      WHERE u.username = 'tenant_b_user' AND r.tenant_id = $1 AND r.name = 'HOSPITAL_ADMIN';
    `, [tenantBId]);

    await e2eClient.end();
  } catch (err: any) {
    console.error('Failed to setup E2E database:', err.message);
    throw err;
  }
}

export default globalSetup;


