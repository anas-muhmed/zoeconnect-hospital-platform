// Run once to create/migrate the mortuary_db schema.
// Usage: node db/setupSchema.js
// This is NOT called on every server boot — boot just verifies connectivity.
// Re-running this is safe: all DDL is idempotent (CREATE IF NOT EXISTS,
// ADD COLUMN IF NOT EXISTS, etc.).

import 'dotenv/config';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;
// Must match config/db.js's search_path -- Mortuary's tables live in the
// mortuary schema (shared Postgres database with Drug Indenting), not the
// connection role's default `public`. Without this, every unqualified
// CREATE TABLE below would land in public instead, and the app (which
// does set this search_path) would never see them.
const pool = new Pool({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432'),
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || 'root',
  database: process.env.PG_DATABASE || 'mortuary_db',
  options:  '-c search_path=mortuary,public',
});

async function columnExists(table, column) {
  // table_schema here is an explicit filter, not resolved by search_path
  // like the unqualified CREATE TABLE statements below -- must name the
  // schema directly.
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'mortuary' AND table_name = $1 AND column_name = $2`,
    [table.toLowerCase(), column.toLowerCase()]
  );
  return rows.length > 0;
}

async function setupSchema() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL.');

    // ── Tables ───────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cabins (
        id            VARCHAR(36) PRIMARY KEY,
        "cabinNumber" VARCHAR(50) UNIQUE NOT NULL,
        status        VARCHAR(50) DEFAULT 'Available',
        tariff        REAL DEFAULT 500,
        daily_rate    NUMERIC(10,2) DEFAULT 500.00,
        floor         INTEGER DEFAULT 1,
        cabin_type    VARCHAR(20) DEFAULT 'NORMAL_CABIN'
                        CHECK (cabin_type IN ('FREEZER','NORMAL_CABIN')),
        "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin (
        id          VARCHAR(36) PRIMARY KEY,
        username    VARCHAR(100) UNIQUE NOT NULL,
        email       VARCHAR(150),
        password    VARCHAR(255) NOT NULL,
        role        VARCHAR(50) DEFAULT 'Admin'
                    CHECK (role IN ('Admin', 'SuperAdmin')),
        status      VARCHAR(50) DEFAULT 'Active'
                    CHECK (status IN ('Active', 'Inactive')),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS body_types (
        id          VARCHAR(36) PRIMARY KEY,
        name        VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS concession_authorities (
        id                  VARCHAR(36) PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        designation         VARCHAR(255),
        department          VARCHAR(255),
        "maxDiscountPercent" REAL DEFAULT 100,
        "isActive"          INTEGER DEFAULT 1,
        "createdAt"         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        full_name       VARCHAR(255) NOT NULL,
        employee_id     VARCHAR(100) UNIQUE NOT NULL,
        department      VARCHAR(100),
        phone1          VARCHAR(20),
        phone2          VARCHAR(20),
        email           VARCHAR(150) UNIQUE NOT NULL,
        password        VARCHAR(255) NOT NULL,
        approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (approval_status IN ('pending','approved','rejected')),
        admin_remarks   VARCHAR(500),
        must_change_password BOOLEAN DEFAULT FALSE,
        password_reset_requested BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bodies (
        id                        VARCHAR(36) PRIMARY KEY,
        "bodyNumber"              VARCHAR(50) UNIQUE NOT NULL,
        "bodyType"                VARCHAR(50) NOT NULL,
        "hospitalNumber"          VARCHAR(100),
        "patientName"             VARCHAR(255),
        gender                    VARCHAR(20),
        age                       INTEGER,
        locality                  VARCHAR(255),
        "dateOfDeath"             VARCHAR(50),
        "timeOfDeath"             VARCHAR(50),
        "declaredBy"              VARCHAR(255),
        "reasonOfDeath"           TEXT,
        "deathIntimationNo"       VARCHAR(100),
        "mlcNo"                   VARCHAR(100),
        "estimatedDaysOfStay"     INTEGER,
        "witness1Name"            VARCHAR(255),
        "witness1Address"         TEXT,
        "witness1Contact"         VARCHAR(50),
        "witness2Name"            VARCHAR(255),
        "witness2Address"         TEXT,
        "witness2Contact"         VARCHAR(50),
        billing_status            VARCHAR(50) DEFAULT 'PENDING',
        status                    VARCHAR(50) DEFAULT 'Registered',
        "policeStationName"       VARCHAR(255),
        "stationSiName"           VARCHAR(255),
        "presentPoliceOfficerName" VARCHAR(255),
        "nocCertificateUrl"       TEXT,
        "freezerRequired"         SMALLINT DEFAULT 1,
        "createdAt"               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cabin_allocations (
        id                        VARCHAR(36) PRIMARY KEY,
        "bodyId"                  VARCHAR(36) NOT NULL,
        "cabinId"                 VARCHAR(36) NOT NULL,
        "admissionDateTime"       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "releaseDateTime"         TIMESTAMP,
        "estimatedReleaseDateTime" TIMESTAMP,
        "advanceAmount"           REAL DEFAULT 0,
        "hourlyRate"              REAL DEFAULT 50,
        "minHours"                INTEGER DEFAULT 4,
        "freeHours"               INTEGER DEFAULT 0,
        status                    VARCHAR(50) DEFAULT 'Allocated',
        "createdAt"               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS billing (
        id                    VARCHAR(36) PRIMARY KEY,
        "bodyId"              VARCHAR(36) NOT NULL,
        "cabinAllocationId"   VARCHAR(36),
        "totalAmount"         REAL DEFAULT 0,
        "discountAmount"      REAL DEFAULT 0,
        "discountReason"      TEXT,
        "concessionAuthorityId" VARCHAR(36),
        "netAmount"           REAL DEFAULT 0,
        "servicesAmount"      REAL DEFAULT 0,
        status                VARCHAR(50) DEFAULT 'Pending',
        "settledAt"           TIMESTAMP,
        "createdAt"           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "firstDayCharge"      NUMERIC(10,2),
        "extraHours"          INTEGER,
        "hourlyRate"          NUMERIC(10,2),
        "additionalHourCharges" NUMERIC(10,2),
        "totalHours"          INTEGER,
        "advanceAmount"       NUMERIC(10,2),
        "staffConcession"     SMALLINT DEFAULT 0,
        "staffName"           VARCHAR(255),
        "staffEmployeeId"     VARCHAR(100),
        "staffAddress"        TEXT,
        "staffPhone"          VARCHAR(20),
        "staffRelation"       VARCHAR(100)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_services (
        id            VARCHAR(36) PRIMARY KEY,
        "billingId"   VARCHAR(36) NOT NULL,
        "serviceId"   VARCHAR(36),
        "serviceName" VARCHAR(255) NOT NULL,
        amount        REAL NOT NULL,
        "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_billing (
        id              VARCHAR(36) PRIMARY KEY,
        "bodyId"        VARCHAR(36) NOT NULL,
        "billingId"     VARCHAR(36),
        "serviceId"     VARCHAR(36),
        "serviceName"   VARCHAR(255) NOT NULL,
        "serviceAmount" NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        "discountAmount" NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        "netAmount"     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status          VARCHAR(50) DEFAULT 'Pending',
        "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_master (
        id           VARCHAR(36) PRIMARY KEY,
        service_name VARCHAR(255) NOT NULL,
        tariff       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS body_releases (
        id                VARCHAR(36) PRIMARY KEY,
        "bodyId"          VARCHAR(36) NOT NULL,
        "releaseType"     VARCHAR(50) NOT NULL,
        "takenBy"         VARCHAR(255),
        relationship      VARCHAR(100),
        address           TEXT,
        "contactNumber"   VARCHAR(50),
        "policeStation"   VARCHAR(255),
        "siName"          VARCHAR(255),
        "nocDocument"     TEXT,
        "legalDocuments"  TEXT,
        "releaseDateTime" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "createdAt"       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS housekeeping_tasks (
        id          VARCHAR(36) PRIMARY KEY,
        "cabinId"   VARCHAR(36) NOT NULL,
        status      VARCHAR(50) DEFAULT 'PENDING',
        "assignedTo" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id                       VARCHAR(36) PRIMARY KEY,
        mortuary_name            VARCHAR(255) DEFAULT 'MOSC Medical College Mortuary',
        mortuary_logo            TEXT,
        first_day_charge         NUMERIC(10,2) NOT NULL DEFAULT 2100.00,
        hourly_charge_after_24hrs NUMERIC(10,2) NOT NULL DEFAULT 130.00,
        updated_by               VARCHAR(255),
        updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id            VARCHAR(36) PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        logo          TEXT,
        contact_email VARCHAR(150),
        contact_phone VARCHAR(20),
        address       TEXT,
        is_active     BOOLEAN DEFAULT true,
        "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Idempotent column migrations ─────────────────────────────────────────
    const TENANT_TABLES = [
      'users', 'admin', 'bodies', 'cabins', 'cabin_allocations', 'billing',
      'billing_services', 'service_billing', 'service_master',
      'concession_authorities', 'housekeeping_tasks', 'body_releases',
      'system_settings',
    ];

    const colMigrations = [
      ['cabins',                 'cabin_type',               "VARCHAR(20) DEFAULT 'NORMAL_CABIN'"],
      ['cabins',                 'daily_rate',               'NUMERIC(10,2) DEFAULT 500.00'],
      ['bodies',                 'billing_status',           "VARCHAR(50) DEFAULT 'PENDING'"],
      ['bodies',                 'policeStationName',        'VARCHAR(255)'],
      ['bodies',                 'stationSiName',            'VARCHAR(255)'],
      ['bodies',                 'presentPoliceOfficerName', 'VARCHAR(255)'],
      ['bodies',                 'nocCertificateUrl',        'TEXT'],
      ['bodies',                 'freezerRequired',          'SMALLINT DEFAULT 1'],
      ['cabin_allocations',      'estimatedReleaseDateTime', 'TIMESTAMP'],
      ['billing_services',       'serviceId',                'VARCHAR(36)'],
      ['concession_authorities', 'isActive',                 'INTEGER DEFAULT 1'],
      ['users',                  'approval_status',          "VARCHAR(20) NOT NULL DEFAULT 'pending'"],
      ['users',                  'admin_remarks',            'VARCHAR(500)'],
      ['users',                  'updated_at',               'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
      ['users',                  'must_change_password',     'BOOLEAN DEFAULT FALSE'],
      ['users',                  'password_reset_requested', 'BOOLEAN DEFAULT FALSE'],
      ['admin',                  'must_change_password',     'BOOLEAN DEFAULT FALSE'],
      ['system_settings',        'mortuary_name',            "VARCHAR(255) DEFAULT 'MOSC Medical College Mortuary'"],
      ['system_settings',        'mortuary_logo',            'TEXT'],
      ['system_settings',        'pricing_model',            "VARCHAR(30) NOT NULL DEFAULT 'tiered_flat_hourly'"],
      ['system_settings',        'daily_rate',               'NUMERIC(10,2) DEFAULT 500.00'],
      ['system_settings',        'staff_discount_percent',   'NUMERIC(5,2) NOT NULL DEFAULT 100'],
      ['hospitals',              'client_id',                'VARCHAR(50)'],
      ...TENANT_TABLES.map(table => [table, 'hospital_id', 'VARCHAR(36)']),
    ];

    for (const [table, column, type] of colMigrations) {
      try {
        const exists = await columnExists(table, column.toLowerCase());
        if (!exists) {
          await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "${column}" ${type}`);
          console.log(`Migration: added ${table}."${column}"`);
        }
      } catch (err) {
        console.log(`Migration skip (${table}.${column}):`, err.message);
      }
    }

    // ── Backfill existing data into a default hospital ──────────────────────
    let { rows: existingHospital } = await pool.query('SELECT id FROM hospitals LIMIT 1');
    let defaultHospitalId = existingHospital[0]?.id;

    if (!defaultHospitalId) {
      defaultHospitalId = uuidv4();
      await pool.query(
        'INSERT INTO hospitals (id, name) VALUES ($1, $2)',
        [defaultHospitalId, 'MOSC Medical College Mortuary']
      );
      console.log(`Migration: created default hospital (${defaultHospitalId})`);
    }

    const { rows: hospitalsWithoutClientId } = await pool.query(
      'SELECT id, name FROM hospitals WHERE client_id IS NULL'
    );
    for (const h of hospitalsWithoutClientId) {
      const prefix = (h.name || 'HOSP').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'HOSP';
      const suffix = Math.floor(1000 + Math.random() * 9000);
      await pool.query('UPDATE hospitals SET client_id = $1 WHERE id = $2', [`${prefix}${suffix}`, h.id]);
      console.log(`Migration: assigned client_id ${prefix}${suffix} to hospital ${h.name}`);
    }

    try {
      await pool.query(`
        ALTER TABLE hospitals ADD CONSTRAINT hospitals_client_id_unique UNIQUE (client_id)
      `);
    } catch (err) {
      console.log('Could not add hospitals client_id unique constraint:', err.message);
    }

    for (const table of TENANT_TABLES) {
      const { rowCount } = await pool.query(
        `UPDATE ${table} SET hospital_id = $1 WHERE hospital_id IS NULL`,
        [defaultHospitalId]
      );
      if (rowCount > 0) console.log(`Migration: backfilled ${rowCount} row(s) in ${table}`);
    }

    for (const table of TENANT_TABLES) {
      try {
        await pool.query(`ALTER TABLE ${table} ALTER COLUMN hospital_id SET DEFAULT '${defaultHospitalId}'`);
      } catch (err) {
        console.log(`Could not set hospital_id default on ${table}:`, err.message);
      }
    }

    for (const table of TENANT_TABLES) {
      try {
        await pool.query(`ALTER TABLE ${table} ALTER COLUMN hospital_id SET NOT NULL`);
      } catch (err) {
        console.log(`Could not enforce NOT NULL on ${table}.hospital_id yet:`, err.message);
      }
    }

    try {
      await pool.query(`ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_pricing_model_check`);
      await pool.query(`
        ALTER TABLE system_settings ADD CONSTRAINT system_settings_pricing_model_check
        CHECK (pricing_model IN ('tiered_flat_hourly', 'flat_daily', 'free'))
      `);
    } catch (err) {
      console.log('Could not add pricing_model check constraint:', err.message);
    }

    try {
      await pool.query(`
        ALTER TABLE system_settings ADD CONSTRAINT system_settings_hospital_id_unique UNIQUE (hospital_id)
      `);
    } catch (err) {
      console.log('Could not add system_settings hospital_id unique constraint:', err.message);
    }

    const { rows: hospitalsWithoutSettings } = await pool.query(`
      SELECT h.id FROM hospitals h
      LEFT JOIN system_settings s ON s.hospital_id = h.id
      WHERE s.id IS NULL
    `);
    for (const { id: hospId } of hospitalsWithoutSettings) {
      await pool.query(
        'INSERT INTO system_settings (id, hospital_id, first_day_charge, hourly_charge_after_24hrs) VALUES ($1, $2, $3, $4)',
        [uuidv4(), hospId, 2100.00, 130.00]
      );
      console.log(`Migration: seeded default settings for hospital ${hospId}`);
    }

    // ── Indexes ──────────────────────────────────────────────────────────────
    const indexes = [
      ['idx_cabin_allocations_bodyid',   'cabin_allocations',  '"bodyId"'],
      ['idx_cabin_allocations_cabinid',  'cabin_allocations',  '"cabinId"'],
      ['idx_cabin_allocations_status',   'cabin_allocations',  'status'],
      ['idx_billing_bodyid',             'billing',            '"bodyId"'],
      ['idx_billing_status',             'billing',            'status'],
      ['idx_body_releases_bodyid',       'body_releases',      '"bodyId"'],
      ['idx_bodies_status',              'bodies',             'status'],
      ['idx_bodies_billing_status',      'bodies',             'billing_status'],
      ['idx_housekeeping_cabinid',       'housekeeping_tasks', '"cabinId"'],
      ['idx_service_billing_bodyid',     'service_billing',    '"bodyId"'],
      ['idx_service_billing_billingid',  'service_billing',    '"billingId"'],
      ['idx_billing_services_billingid', 'billing_services',   '"billingId"'],
      ['idx_billing_createdat',          'billing',            '"createdAt"'],
      ['idx_cabin_allocations_admission','cabin_allocations',  '"admissionDateTime"'],
      ...TENANT_TABLES.map(t => [`idx_${t}_hospitalid`, t, 'hospital_id']),
    ];

    for (const [name, table, column] of indexes) {
      try {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${column})`);
      } catch (err) {
        console.log(`Index skip (${name}):`, err.message);
      }
    }

    // ── Seed defaults ─────────────────────────────────────────────────────────
    const { rows: cabinRows } = await pool.query('SELECT COUNT(*) AS count FROM cabins');
    if (parseInt(cabinRows[0].count) === 0) {
      for (let i = 1; i <= 10; i++) {
        await pool.query(
          'INSERT INTO cabins (id, "cabinNumber", status, tariff) VALUES ($1, $2, $3, $4)',
          [uuidv4(), `CAB-${i.toString().padStart(3, '0')}`, 'Available', 500]
        );
      }
      console.log('Seeded 10 default cabins.');
    }

    const { rows: bodyTypeRows } = await pool.query('SELECT COUNT(*) AS count FROM body_types');
    if (parseInt(bodyTypeRows[0].count) === 0) {
      await pool.query('INSERT INTO body_types (id, name, description) VALUES ($1, $2, $3)',
        [uuidv4(), 'MLC', 'Medico-Legal Case']);
      await pool.query('INSERT INTO body_types (id, name, description) VALUES ($1, $2, $3)',
        [uuidv4(), 'Non-MLC', 'Non-Medico-Legal Case']);
      console.log('Seeded body types.');
    }

    const { rows: serviceRows } = await pool.query('SELECT COUNT(*) AS count FROM service_master');
    if (parseInt(serviceRows[0].count) === 0) {
      await pool.query('INSERT INTO service_master (id, service_name, tariff) VALUES ($1, $2, $3)',
        [uuidv4(), 'Body Dressing', 500.00]);
      console.log('Seeded default Body Dressing service.');
    }

    console.log('Schema setup complete.');
  } catch (err) {
    console.error('Schema setup failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupSchema();
