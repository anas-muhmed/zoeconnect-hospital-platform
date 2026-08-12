-- ============================================================
-- patch-role-permissions.sql
-- Run ONCE to seed role_permissions junction table and fix
-- loyalty_transactions NOT NULL constraints.
-- Usage:
--   docker exec hdsp_postgres psql -U hdsp_app -d hdsp_db -f /tmp/patch.sql
-- (copy this file into the container first, or pipe it:)
--   docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db < patch-role-permissions.sql
-- ============================================================

BEGIN;

-- ── 1. SUPER_ADMIN → all permissions ─────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ── 2. HOSPITAL_ADMIN → all PLATFORM permissions ──────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.module_code = 'PLATFORM'
WHERE r.name = 'HOSPITAL_ADMIN'
ON CONFLICT DO NOTHING;

-- ── 3. LOYALTY_OPERATOR → loyalty accounts / transactions / redemptions / card_config read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  p.module_code = 'LOYALTY' AND (
       p.resource = 'ACCOUNTS'
    OR p.resource = 'TRANSACTIONS'
    OR p.resource = 'REDEMPTIONS'
    OR (p.resource = 'CARD_CONFIG' AND p.action = 'READ')
  )
)
WHERE r.name = 'LOYALTY_OPERATOR'
ON CONFLICT DO NOTHING;

-- ── 4. MARKETING_TEAM → campaigns (all) + accounts read + loyalty reports ─────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
  p.module_code = 'LOYALTY' AND (
       p.resource = 'CAMPAIGNS'
    OR p.resource = 'REPORTS'
    OR (p.resource = 'ACCOUNTS' AND p.action = 'READ')
  )
)
WHERE r.name = 'MARKETING_TEAM'
ON CONFLICT DO NOTHING;

-- ── 5. MANAGEMENT → reports read + audit read (across modules) ────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
     (p.resource = 'REPORTS'    AND p.action = 'READ')
  OR (p.resource = 'AUDIT_LOGS' AND p.action = 'READ')
)
WHERE r.name = 'MANAGEMENT'
ON CONFLICT DO NOTHING;

-- ── 6. Fix loyalty_transactions NOT NULL constraints ──────────────────────────
ALTER TABLE loyalty_transactions ALTER COLUMN created_by    DROP NOT NULL;
ALTER TABLE loyalty_transactions ALTER COLUMN reference_id  DROP NOT NULL;
ALTER TABLE loyalty_transactions ALTER COLUMN reference_type DROP NOT NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT r.name AS role, COUNT(rp.permission_id) AS assigned_permissions
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
GROUP BY r.name
ORDER BY r.name;

COMMIT;
