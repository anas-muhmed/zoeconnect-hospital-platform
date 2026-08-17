-- Migration 002: Column additions added after the initial release
-- These represent schema changes made over time as features were added.
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS is safe on existing databases.

SET search_path TO mortuary, public;

ALTER TABLE cabins            ADD COLUMN IF NOT EXISTS cabin_type  VARCHAR(20) DEFAULT 'NORMAL_CABIN';
ALTER TABLE cabins            ADD COLUMN IF NOT EXISTS daily_rate  NUMERIC(10,2) DEFAULT 500.00;

ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS billing_status             VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS "policeStationName"        VARCHAR(255);
ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS "stationSiName"            VARCHAR(255);
ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS "presentPoliceOfficerName" VARCHAR(255);
ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS "nocCertificateUrl"        TEXT;
ALTER TABLE bodies            ADD COLUMN IF NOT EXISTS "freezerRequired"          SMALLINT DEFAULT 1;

ALTER TABLE cabin_allocations ADD COLUMN IF NOT EXISTS "estimatedReleaseDateTime" TIMESTAMP;

ALTER TABLE billing_services  ADD COLUMN IF NOT EXISTS "serviceId" VARCHAR(36);

ALTER TABLE concession_authorities ADD COLUMN IF NOT EXISTS "isActive" INTEGER DEFAULT 1;

ALTER TABLE users             ADD COLUMN IF NOT EXISTS approval_status          VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE users             ADD COLUMN IF NOT EXISTS admin_remarks             VARCHAR(500);
ALTER TABLE users             ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users             ADD COLUMN IF NOT EXISTS must_change_password      BOOLEAN DEFAULT FALSE;
ALTER TABLE users             ADD COLUMN IF NOT EXISTS password_reset_requested  BOOLEAN DEFAULT FALSE;

ALTER TABLE admin             ADD COLUMN IF NOT EXISTS must_change_password      BOOLEAN DEFAULT FALSE;

ALTER TABLE system_settings   ADD COLUMN IF NOT EXISTS mortuary_name             VARCHAR(255) DEFAULT 'MOSC Medical College Mortuary';
ALTER TABLE system_settings   ADD COLUMN IF NOT EXISTS mortuary_logo             TEXT;
ALTER TABLE system_settings   ADD COLUMN IF NOT EXISTS pricing_model             VARCHAR(30) NOT NULL DEFAULT 'tiered_flat_hourly';
ALTER TABLE system_settings   ADD COLUMN IF NOT EXISTS daily_rate                NUMERIC(10,2) DEFAULT 500.00;
ALTER TABLE system_settings   ADD COLUMN IF NOT EXISTS staff_discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 100;

ALTER TABLE hospitals         ADD COLUMN IF NOT EXISTS client_id                 VARCHAR(50);

-- hospital_id added to all tenant tables (multi-hospital support)
ALTER TABLE users              ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE admin              ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE bodies             ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE cabins             ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE cabin_allocations  ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE billing            ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE billing_services   ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE service_billing    ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE service_master     ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE concession_authorities ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE body_releases      ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
ALTER TABLE system_settings    ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(36);
