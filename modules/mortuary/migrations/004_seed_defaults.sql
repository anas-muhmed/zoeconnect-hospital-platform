-- Migration 004: Seed default data
-- Inserts the minimum data needed for the app to be usable out of the box.
-- Each INSERT uses WHERE NOT EXISTS so re-running this migration is safe —
-- it only inserts if the data isn't already there.

SET search_path TO mortuary, public;

-- Default hospital (required — every row in tenant tables needs a hospital_id)
INSERT INTO hospitals (id, name, client_id)
SELECT
  'default-hospital-0000-0000-000000000001',
  'MOSC Medical College Mortuary',
  'MOSC1001'
WHERE NOT EXISTS (SELECT 1 FROM hospitals LIMIT 1);

-- Default system settings for the default hospital
INSERT INTO system_settings (id, hospital_id, first_day_charge, hourly_charge_after_24hrs, pricing_model)
SELECT
  'default-settings-0000-0000-000000000001',
  'default-hospital-0000-0000-000000000001',
  2100.00,
  130.00,
  'tiered_flat_hourly'
WHERE NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1);

-- 10 default cabins
INSERT INTO cabins (id, "cabinNumber", status, tariff, hospital_id)
SELECT
  'cab-default-' || lpad(n::text, 3, '0'),
  'CAB-' || lpad(n::text, 3, '0'),
  'Available',
  500,
  'default-hospital-0000-0000-000000000001'
FROM generate_series(1, 10) AS n
WHERE NOT EXISTS (SELECT 1 FROM cabins LIMIT 1);

-- Body types
INSERT INTO body_types (id, name, description)
SELECT 'bodytype-mlc-00000-0000-000000000001', 'MLC',     'Medico-Legal Case'
WHERE NOT EXISTS (SELECT 1 FROM body_types WHERE name = 'MLC');

INSERT INTO body_types (id, name, description)
SELECT 'bodytype-non-00000-0000-000000000002', 'Non-MLC', 'Non-Medico-Legal Case'
WHERE NOT EXISTS (SELECT 1 FROM body_types WHERE name = 'Non-MLC');

-- Default service
INSERT INTO service_master (id, service_name, tariff, hospital_id)
SELECT
  'service-dressing-0000-0000-000000000001',
  'Body Dressing',
  500.00,
  'default-hospital-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM service_master LIMIT 1);
