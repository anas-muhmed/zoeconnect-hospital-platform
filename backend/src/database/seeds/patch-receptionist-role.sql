-- ============================================================
-- patch-receptionist-role.sql
-- GAP-19: Seeds the RECEPTIONIST role and TOKEN:ISSUE:MANUAL permission.
--
-- Run ONCE after deploying the GAP-19 code changes:
--   docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db \
--     < patch-receptionist-role.sql
-- ============================================================

BEGIN;

-- 1. Ensure TOKEN:ISSUE:MANUAL permission exists
INSERT INTO permissions (module_code, resource, action, description)
VALUES (
  'TOKEN',
  'ISSUE',
  'MANUAL',
  'Issue a token manually from the staff/receptionist desk'
)
ON CONFLICT (module_code, resource, action) DO NOTHING;

-- 2. Ensure RECEPTIONIST role exists
INSERT INTO roles (name, description, is_system, module_code)
VALUES ('RECEPTIONIST', 'Front-desk staff who can view counters and issue tokens manually', FALSE, 'TOKEN')
ON CONFLICT (name) DO NOTHING;

-- 3. Assign TOKEN:COUNTER:READ and TOKEN:ISSUE:MANUAL to RECEPTIONIST
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
     (p.module_code = 'TOKEN'     AND p.resource = 'COUNTER' AND p.action = 'READ')
  OR (p.module_code = 'TOKEN'     AND p.resource = 'ISSUE'   AND p.action = 'MANUAL')
)
WHERE r.name = 'RECEPTIONIST'
ON CONFLICT DO NOTHING;

-- Verify
SELECT r.name AS role, p.module_code || ':' || p.resource || ':' || p.action AS permission
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'RECEPTIONIST'
ORDER BY permission;

COMMIT;
