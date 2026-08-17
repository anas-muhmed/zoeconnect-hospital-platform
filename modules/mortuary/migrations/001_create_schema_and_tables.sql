-- Migration 001: Create mortuary schema and all core tables
-- This is the baseline — everything that must exist before the app can run.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS means existing tables are untouched.

CREATE SCHEMA IF NOT EXISTS mortuary;

SET search_path TO mortuary, public;

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
);

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
);

CREATE TABLE IF NOT EXISTS body_types (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS concession_authorities (
  id                   VARCHAR(36) PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  designation          VARCHAR(255),
  department           VARCHAR(255),
  "maxDiscountPercent" REAL DEFAULT 100,
  "isActive"           INTEGER DEFAULT 1,
  "createdAt"          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id                       SERIAL PRIMARY KEY,
  full_name                VARCHAR(255) NOT NULL,
  employee_id              VARCHAR(100) UNIQUE NOT NULL,
  department               VARCHAR(100),
  phone1                   VARCHAR(20),
  phone2                   VARCHAR(20),
  email                    VARCHAR(150) UNIQUE NOT NULL,
  password                 VARCHAR(255) NOT NULL,
  approval_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                             CHECK (approval_status IN ('pending','approved','rejected')),
  admin_remarks            VARCHAR(500),
  must_change_password     BOOLEAN DEFAULT FALSE,
  password_reset_requested BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bodies (
  id                         VARCHAR(36) PRIMARY KEY,
  "bodyNumber"               VARCHAR(50) UNIQUE NOT NULL,
  "bodyType"                 VARCHAR(50) NOT NULL,
  "hospitalNumber"           VARCHAR(100),
  "patientName"              VARCHAR(255),
  gender                     VARCHAR(20),
  age                        INTEGER,
  locality                   VARCHAR(255),
  "dateOfDeath"              VARCHAR(50),
  "timeOfDeath"              VARCHAR(50),
  "declaredBy"               VARCHAR(255),
  "reasonOfDeath"            TEXT,
  "deathIntimationNo"        VARCHAR(100),
  "mlcNo"                    VARCHAR(100),
  "estimatedDaysOfStay"      INTEGER,
  "witness1Name"             VARCHAR(255),
  "witness1Address"          TEXT,
  "witness1Contact"          VARCHAR(50),
  "witness2Name"             VARCHAR(255),
  "witness2Address"          TEXT,
  "witness2Contact"          VARCHAR(50),
  billing_status             VARCHAR(50) DEFAULT 'PENDING',
  status                     VARCHAR(50) DEFAULT 'Registered',
  "policeStationName"        VARCHAR(255),
  "stationSiName"            VARCHAR(255),
  "presentPoliceOfficerName" VARCHAR(255),
  "nocCertificateUrl"        TEXT,
  "freezerRequired"          SMALLINT DEFAULT 1,
  "createdAt"                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cabin_allocations (
  id                         VARCHAR(36) PRIMARY KEY,
  "bodyId"                   VARCHAR(36) NOT NULL,
  "cabinId"                  VARCHAR(36) NOT NULL,
  "admissionDateTime"        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "releaseDateTime"          TIMESTAMP,
  "estimatedReleaseDateTime" TIMESTAMP,
  "advanceAmount"            REAL DEFAULT 0,
  "hourlyRate"               REAL DEFAULT 50,
  "minHours"                 INTEGER DEFAULT 4,
  "freeHours"                INTEGER DEFAULT 0,
  status                     VARCHAR(50) DEFAULT 'Allocated',
  "createdAt"                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing (
  id                      VARCHAR(36) PRIMARY KEY,
  "bodyId"                VARCHAR(36) NOT NULL,
  "cabinAllocationId"     VARCHAR(36),
  "totalAmount"           REAL DEFAULT 0,
  "discountAmount"        REAL DEFAULT 0,
  "discountReason"        TEXT,
  "concessionAuthorityId" VARCHAR(36),
  "netAmount"             REAL DEFAULT 0,
  "servicesAmount"        REAL DEFAULT 0,
  status                  VARCHAR(50) DEFAULT 'Pending',
  "settledAt"             TIMESTAMP,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "firstDayCharge"        NUMERIC(10,2),
  "extraHours"            INTEGER,
  "hourlyRate"            NUMERIC(10,2),
  "additionalHourCharges" NUMERIC(10,2),
  "totalHours"            INTEGER,
  "advanceAmount"         NUMERIC(10,2),
  "staffConcession"       SMALLINT DEFAULT 0,
  "staffName"             VARCHAR(255),
  "staffEmployeeId"       VARCHAR(100),
  "staffAddress"          TEXT,
  "staffPhone"            VARCHAR(20),
  "staffRelation"         VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS billing_services (
  id            VARCHAR(36) PRIMARY KEY,
  "billingId"   VARCHAR(36) NOT NULL,
  "serviceId"   VARCHAR(36),
  "serviceName" VARCHAR(255) NOT NULL,
  amount        REAL NOT NULL,
  "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS service_master (
  id           VARCHAR(36) PRIMARY KEY,
  service_name VARCHAR(255) NOT NULL,
  tariff       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id           VARCHAR(36) PRIMARY KEY,
  "cabinId"    VARCHAR(36) NOT NULL,
  status       VARCHAR(50) DEFAULT 'PENDING',
  "assignedTo" VARCHAR(255),
  "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id                        VARCHAR(36) PRIMARY KEY,
  mortuary_name             VARCHAR(255) DEFAULT 'MOSC Medical College Mortuary',
  mortuary_logo             TEXT,
  first_day_charge          NUMERIC(10,2) NOT NULL DEFAULT 2100.00,
  hourly_charge_after_24hrs NUMERIC(10,2) NOT NULL DEFAULT 130.00,
  updated_by                VARCHAR(255),
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);
