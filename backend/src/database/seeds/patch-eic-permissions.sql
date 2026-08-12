-- ============================================================
-- patch-eic-permissions.sql
-- Adds EIC permissions, roles, and role-permission mappings.
-- Safe to run on an existing database (all inserts use ON CONFLICT DO NOTHING).
--
-- Usage:
--   docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db < patch-eic-permissions.sql
-- ============================================================

BEGIN;

-- ── 1. EIC module in module_registry ─────────────────────────────────────────
INSERT INTO module_registry (id, code, name, route, version, is_active, license_required, display_order, description)
VALUES (gen_random_uuid(), 'EIC', 'Early Intervention Centre', '/eic', '1.0.0', true, true, 5, 'Therapy enrollment, assessments, sessions and discharge')
ON CONFLICT (code) DO NOTHING;

-- ── 2. EIC permissions ────────────────────────────────────────────────────────
INSERT INTO permissions (id, module_code, resource, action) VALUES
  (gen_random_uuid(), 'EIC', 'PATIENTS',         'READ'),
  (gen_random_uuid(), 'EIC', 'PATIENTS',         'CREATE'),
  (gen_random_uuid(), 'EIC', 'ENROLLMENTS',      'CREATE'),
  (gen_random_uuid(), 'EIC', 'ASSESSMENTS',      'READ'),
  (gen_random_uuid(), 'EIC', 'ASSESSMENTS',      'CREATE'),
  (gen_random_uuid(), 'EIC', 'ASSESSMENTS',      'COUNTERSIGN'),
  (gen_random_uuid(), 'EIC', 'SESSIONS',         'READ'),
  (gen_random_uuid(), 'EIC', 'SESSIONS',         'CREATE'),
  (gen_random_uuid(), 'EIC', 'PROGRESS_REPORTS', 'READ'),
  (gen_random_uuid(), 'EIC', 'PROGRESS_REPORTS', 'CREATE'),
  (gen_random_uuid(), 'EIC', 'PROGRESS_REPORTS', 'SIGN'),
  (gen_random_uuid(), 'EIC', 'DISCHARGE',        'CREATE'),
  (gen_random_uuid(), 'EIC', 'DISCHARGE',        'SIGN'),
  (gen_random_uuid(), 'EIC', 'PRESCHOOL',        'READ'),
  (gen_random_uuid(), 'EIC', 'PRESCHOOL',        'CREATE')
ON CONFLICT (module_code, resource, action) DO NOTHING;

-- ── 3. EIC roles ──────────────────────────────────────────────────────────────
INSERT INTO roles (id, name, description, is_system, module_code) VALUES
  (gen_random_uuid(), 'EIC_THERAPIST',        'EIC therapist — create assessments & sessions',         false, 'EIC'),
  (gen_random_uuid(), 'EIC_CENTRE_HEAD',      'EIC centre head — countersign & finalise records',      false, 'EIC'),
  (gen_random_uuid(), 'EIC_PRESCHOOL_TEACHER','EIC preschool teacher — assessments & daily reports',   false, 'EIC')
ON CONFLICT (name) DO NOTHING;

-- ── 4. EIC_THERAPIST permissions ──────────────────────────────────────────────
-- Gets everything except COUNTERSIGN / SIGN (those are supervisor actions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module_code = 'EIC'
WHERE r.name = 'EIC_THERAPIST'
  AND NOT (p.resource = 'ASSESSMENTS'      AND p.action = 'COUNTERSIGN')
  AND NOT (p.resource = 'PROGRESS_REPORTS' AND p.action = 'SIGN')
  AND NOT (p.resource = 'DISCHARGE'        AND p.action = 'SIGN')
ON CONFLICT DO NOTHING;

-- ── 5. EIC_CENTRE_HEAD permissions ────────────────────────────────────────────
-- Gets ALL EIC permissions (therapist actions + countersign/sign)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module_code = 'EIC'
WHERE r.name = 'EIC_CENTRE_HEAD'
ON CONFLICT DO NOTHING;

-- ── 6. EIC_PRESCHOOL_TEACHER — preschool read + create only ──────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module_code = 'EIC'
WHERE r.name = 'EIC_PRESCHOOL_TEACHER'
  AND p.resource IN ('PATIENTS', 'PRESCHOOL')
ON CONFLICT DO NOTHING;

-- ── 7. SUPER_ADMIN + HOSPITAL_ADMIN get all new EIC permissions too ───────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module_code = 'EIC'
WHERE r.name IN ('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'EIC_CENTRE_HEAD')
ON CONFLICT DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT r.name AS role, COUNT(rp.permission_id) AS assigned_permissions
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
GROUP BY r.name
ORDER BY r.name;

COMMIT;
