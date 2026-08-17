-- Migration 003: Constraints and indexes
-- Constraints enforce data integrity. Indexes speed up the queries
-- the app runs most often (filtering by bodyId, status, hospital_id etc.)
-- CREATE INDEX IF NOT EXISTS and DO $$ blocks make these safe to re-run.

SET search_path TO mortuary, public;

-- ── Constraints ───────────────────────────────────────────────────────────────

ALTER TABLE hospitals
  ADD CONSTRAINT IF NOT EXISTS hospitals_client_id_unique UNIQUE (client_id);

ALTER TABLE system_settings
  ADD CONSTRAINT IF NOT EXISTS system_settings_hospital_id_unique UNIQUE (hospital_id);

-- Drop old version of the check constraint if it exists, then add the current one.
-- (ALTER TABLE ... ADD CONSTRAINT errors if the constraint already exists,
--  so we drop first to make this idempotent.)
ALTER TABLE system_settings
  DROP CONSTRAINT IF EXISTS system_settings_pricing_model_check;
ALTER TABLE system_settings
  ADD CONSTRAINT system_settings_pricing_model_check
  CHECK (pricing_model IN ('tiered_flat_hourly', 'flat_daily', 'free'));

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cabin_allocations_bodyid    ON cabin_allocations  ("bodyId");
CREATE INDEX IF NOT EXISTS idx_cabin_allocations_cabinid   ON cabin_allocations  ("cabinId");
CREATE INDEX IF NOT EXISTS idx_cabin_allocations_status    ON cabin_allocations  (status);
CREATE INDEX IF NOT EXISTS idx_cabin_allocations_admission ON cabin_allocations  ("admissionDateTime");
CREATE INDEX IF NOT EXISTS idx_billing_bodyid              ON billing            ("bodyId");
CREATE INDEX IF NOT EXISTS idx_billing_status              ON billing            (status);
CREATE INDEX IF NOT EXISTS idx_billing_createdat           ON billing            ("createdAt");
CREATE INDEX IF NOT EXISTS idx_body_releases_bodyid        ON body_releases      ("bodyId");
CREATE INDEX IF NOT EXISTS idx_bodies_status               ON bodies             (status);
CREATE INDEX IF NOT EXISTS idx_bodies_billing_status       ON bodies             (billing_status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_cabinid        ON housekeeping_tasks ("cabinId");
CREATE INDEX IF NOT EXISTS idx_service_billing_bodyid      ON service_billing    ("bodyId");
CREATE INDEX IF NOT EXISTS idx_service_billing_billingid   ON service_billing    ("billingId");
CREATE INDEX IF NOT EXISTS idx_billing_services_billingid  ON billing_services   ("billingId");

-- hospital_id indexes on every tenant table (used in every WHERE clause)
CREATE INDEX IF NOT EXISTS idx_users_hospitalid              ON users              (hospital_id);
CREATE INDEX IF NOT EXISTS idx_admin_hospitalid              ON admin              (hospital_id);
CREATE INDEX IF NOT EXISTS idx_bodies_hospitalid             ON bodies             (hospital_id);
CREATE INDEX IF NOT EXISTS idx_cabins_hospitalid             ON cabins             (hospital_id);
CREATE INDEX IF NOT EXISTS idx_cabin_allocations_hospitalid  ON cabin_allocations  (hospital_id);
CREATE INDEX IF NOT EXISTS idx_billing_hospitalid            ON billing            (hospital_id);
CREATE INDEX IF NOT EXISTS idx_billing_services_hospitalid   ON billing_services   (hospital_id);
CREATE INDEX IF NOT EXISTS idx_service_billing_hospitalid    ON service_billing    (hospital_id);
CREATE INDEX IF NOT EXISTS idx_service_master_hospitalid     ON service_master     (hospital_id);
CREATE INDEX IF NOT EXISTS idx_concession_auth_hospitalid    ON concession_authorities (hospital_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_hospitalid       ON housekeeping_tasks (hospital_id);
CREATE INDEX IF NOT EXISTS idx_body_releases_hospitalid      ON body_releases      (hospital_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_hospitalid    ON system_settings    (hospital_id);
