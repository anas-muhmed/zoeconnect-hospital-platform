const { Client } = require('../backend/node_modules/pg');
const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const config = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.split('=');
    config[key.substring(2)] = value || '';
  }
});

const installDir = config['install-dir'];
if (!installDir) {
  console.error("Missing --install-dir argument");
  process.exit(1);
}

const dbHost = config['db-host'] || 'localhost';
const dbPort = config['db-port'] || '5432';
const dbUser = config['db-user'] || 'postgres';
const dbPassword = config['db-password'] || '';
const dbName = config['db-name'] || 'hdsp_db';
const vendorDbName = config['vendor-db-name'] || 'hdsp_vendor_db';
const isUpgrade = config['is-upgrade'] === 'true';

async function setupDatabase() {
  console.log(`Connecting to PostgreSQL at ${dbHost}:${dbPort} as ${dbUser}...`);
  // Connect to the default 'postgres' database to check/create other databases
  const client = new Client({
    host: dbHost,
    port: parseInt(dbPort, 10),
    user: dbUser,
    password: dbPassword,
    database: 'postgres'
  });

  let connected = false;
  let retries = 10;
  while (!connected && retries > 0) {
    try {
      await client.connect();
      connected = true;
    } catch (err) {
      console.log(`Database not ready yet, retrying... (${retries} attempts left)`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    console.error("Failed to connect to PostgreSQL after multiple attempts.");
    process.exit(1);
  }

  try {
    // Check HDSP DB
    const resHdsp = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (resHdsp.rowCount === 0) {
      console.log(`Creating database ${dbName}...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }

    // Check Vendor DB
    const resVendor = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [vendorDbName]);
    if (resVendor.rowCount === 0) {
      console.log(`Creating database ${vendorDbName}...`);
      await client.query(`CREATE DATABASE "${vendorDbName}"`);
    } else {
      console.log(`Database ${vendorDbName} already exists.`);
    }

  } catch (err) {
    console.error("Error setting up databases:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  // Backups if upgrade
  if (isUpgrade) {
    const backupDir = path.join(installDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pgDump = path.join(installDir, 'pgsql', 'bin', 'pg_dump.exe');
    
    if (fs.existsSync(pgDump)) {
      console.log('Running pre-upgrade database backups...');
      try {
        const env = { ...process.env, PGPASSWORD: dbPassword };
        execSync(`"${pgDump}" -h ${dbHost} -p ${dbPort} -U ${dbUser} -F c -b -v -f "${path.join(backupDir, `${dbName}_${timestamp}.backup`)}" ${dbName}`, { env, stdio: 'ignore' });
        execSync(`"${pgDump}" -h ${dbHost} -p ${dbPort} -U ${dbUser} -F c -b -v -f "${path.join(backupDir, `${vendorDbName}_${timestamp}.backup`)}" ${vendorDbName}`, { env, stdio: 'ignore' });
        console.log('Backups completed successfully.');
      } catch (e) {
        console.warn('Backup warning: pg_dump failed. Proceeding anyway.', e.message);
      }
    } else {
      console.warn('pg_dump.exe not found at bundled path, skipping automatic backup.');
    }
  }

  // Migrations
  //
  // Both `process.exit(1)` calls below were previously commented out (found
  // 2026-07-23 while diagnosing a UAT install where the backend crashed at
  // startup with `relation "license_master" does not exist`). With the exit
  // suppressed, a failed `migration:run` -- for ANY reason: a broken
  // migration, a missing Postgres extension the bundled embedded Postgres
  // build doesn't ship, a bad -d datasource path, anything -- just logged an
  // error and let the installer carry on through seeding, service startup,
  // and its own health-check step as if nothing were wrong. The installer
  // then reports success with a database that has zero application tables
  // in it. `stdio: 'inherit'` means the REAL error was printed to the
  // installer's own console/log at the time -- it just didn't stop
  // anything or get surfaced anywhere someone would look. Restored so a
  // migration failure now fails the install loudly and immediately,
  // matching the same "don't ship an installer that silently produces a
  // broken result" principle already applied to build_installer.ps1's
  // Invoke-Checked helper.
  console.log('Running HDSP Backend Migrations...');
  try {
    const backendDir = path.join(installDir, 'backend');
    // Using node directly on the compiled JS since the installer excludes the src directory
    const bundledNode = path.join(installDir, 'bin', 'node.exe');
    execFileSync(bundledNode, ['node_modules/typeorm/cli.js', 'migration:run', '-d', 'dist/database/data-source.js'], { cwd: backendDir, stdio: 'inherit' });

    console.log('Running HDSP Platform Seeder...');
    execFileSync(bundledNode, ['dist/database/seeds/seed-platform.js'], { cwd: backendDir, stdio: 'inherit' });
  } catch (e) {
    console.error('HDSP Migration failed:', e.message);
    process.exit(1);
  }

  console.log('Running Vendor Backend Migrations...');
  try {
    const vendorBackendDir = path.join(installDir, 'vendor-portal', 'backend');
    if (fs.existsSync(vendorBackendDir)) {
      const bundledNode = path.join(installDir, 'bin', 'node.exe');
      execFileSync(bundledNode, ['node_modules/typeorm/cli.js', 'migration:run', '-d', 'dist/config/database.config.js'], { cwd: vendorBackendDir, stdio: 'inherit' });
    }
  } catch (e) {
    console.error('Vendor Migration failed:', e.message);
    process.exit(1);
  }
}

setupDatabase();
