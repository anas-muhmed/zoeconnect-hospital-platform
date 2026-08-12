-- ============================================================================
-- Token Display -- migration-state, legacy-tenant-reference, and `default`
-- ownership audit. READ-ONLY. Every query below is a SELECT -- nothing here
-- modifies data. Companion to token-display-tenant-audit.sql; run both.
-- ============================================================================

-- ── A. Detail on every row currently under the `default` tenant ─────────────
-- Exact fields requested: display ID, slug, title, created date, updated
-- date, tenant ID, tenant code. This is the set of rows that need manual
-- review to determine "legitimately default" vs. "NULL-backfill artifact".
SELECT
  dp.id          AS display_id,
  dp.slug,
  dp.title,
  dp.created_at,
  dp.updated_at,
  dp.tenant_id,
  t.code         AS tenant_code
FROM display_pages dp
JOIN tenant t ON t.id = dp.tenant_id
WHERE t.code = 'default'
ORDER BY dp.created_at;

-- ── B. Rows still referencing the old hardcoded tenant UUID ─────────────────
-- (0505dbb2-8d0c-41a4-9fcd-1bd9810ca853) -- the source tenant onModuleInit()
-- reassigns FROM, every time the app boots. A non-zero count here means
-- onModuleInit() would still find and modify rows if it ran right now.
--
-- IMPORTANT: onModuleInit()'s own SQL runs `UPDATE cms_displays ...`, but
-- CMSDisplayAssignment's actual @Entity() table name is
-- `cms_display_assignments` (see cms-display-assignment.entity.ts) -- there
-- is no migration anywhere that ever creates a table literally named
-- `cms_displays`. That statement is almost certainly failing with a
-- "relation does not exist" error on every boot (swallowed by
-- onModuleInit()'s try/catch and logged via `this.logger.error(...)`,
-- easy to miss). Query B0 below proves this one way or the other; B's
-- `cms_display_assignments` count uses the real table name so it can
-- actually run.

-- B0. Does a table literally named `cms_displays` exist at all?
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'cms_displays'
) AS cms_displays_table_exists;

SELECT 'display_pages' AS table_name, COUNT(*) AS rows_still_on_old_tenant
FROM display_pages
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853'
UNION ALL
SELECT 'cms_display_assignments', COUNT(*)
FROM cms_display_assignments
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853'
UNION ALL
SELECT 'users', COUNT(*)
FROM users
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853';

-- Row-level detail for each (only useful if the counts above are non-zero):
SELECT id, slug, title, tenant_id, created_at, updated_at
FROM display_pages
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853';

SELECT id, name, tenant_id, created_at
FROM cms_display_assignments
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853';

SELECT id, email, username, tenant_id, created_at
FROM users
WHERE tenant_id = '0505dbb2-8d0c-41a4-9fcd-1bd9810ca853';

-- Also confirm the DESTINATION tenant of the correction
-- (1eb29dd3-e91a-45cd-b741-28cf04661cac) actually exists and is active --
-- onModuleInit() reassigns rows to this ID unconditionally, with no check
-- that it's still a valid/active tenant.
SELECT id, code, name, status
FROM tenant
WHERE id IN ('0505dbb2-8d0c-41a4-9fcd-1bd9810ca853', '1eb29dd3-e91a-45cd-b741-28cf04661cac');

-- ── C. Migration state -- was 1790900000001-TenantScopeTokenDisplaySlug applied? ──
SELECT *
FROM typeorm_migrations
WHERE name LIKE '%TenantScopeTokenDisplaySlug%';

-- For reference, the equivalent CMS migration (same pattern, same era) --
-- useful to compare timestamps/ordering if the above returns no row:
SELECT *
FROM typeorm_migrations
WHERE name LIKE '%TenantScopeCmsDisplayAssignmentSlug%';

-- ── D. Actual DB schema (not the migration source, not the entity file) ─────

-- D1. Is display_pages.tenant_id actually NOT NULL in the live schema?
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'display_pages' AND column_name = 'tenant_id';

-- D2. Does the composite UNIQUE (tenant_id, slug) constraint actually exist?
SELECT
  con.conname   AS constraint_name,
  con.contype   AS constraint_type,   -- 'u' = unique
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'display_pages'
  AND con.contype = 'u';

-- D3. Full constraint/index listing on display_pages, for completeness --
-- shows whether the OLD global-unique-slug constraint was actually dropped
-- (it should be gone if the migration ran cleanly).
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'display_pages';
