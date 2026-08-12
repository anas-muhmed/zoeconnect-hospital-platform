-- ============================================================================
-- Token Display (display_pages) tenant-ownership audit
-- READ-ONLY. Every query below is a SELECT -- nothing here modifies data.
-- Written to answer: did migration 1790900000001-TenantScopeTokenDisplaySlug's
-- NULL-tenant backfill (assigning orphaned rows to the seeded `default`
-- tenant) leave any display pages misfiled under the wrong tenant, and is
-- it safe to make /token/display/{tenantCode}/{slug} the canonical URL yet?
-- Run each section independently; none depend on a previous section's output.
-- ============================================================================

-- 1. Total DisplayPage count
SELECT COUNT(*) AS total_display_pages
FROM display_pages;

-- 2. NULL tenant count
-- Expected 0 if migration 1790900000001 has run (it enforces tenant_id NOT
-- NULL at the DB level). A non-zero count here means that migration has NOT
-- been applied to this database yet.
SELECT COUNT(*) AS null_tenant_count
FROM display_pages
WHERE tenant_id IS NULL;

-- 3. Count by tenant (includes tenant code/name for readability)
SELECT
  dp.tenant_id,
  t.code   AS tenant_code,
  t.name   AS tenant_name,
  t.status AS tenant_status,
  COUNT(*) AS display_page_count
FROM display_pages dp
LEFT JOIN tenant t ON t.id = dp.tenant_id
GROUP BY dp.tenant_id, t.code, t.name, t.status
ORDER BY display_page_count DESC;

-- 4. All rows currently assigned to the `default` tenant
-- These are the ones that need manual review: some may legitimately belong
-- to `default` (a real tenant using that code on purpose), others may be
-- NULL-backfill artifacts from the migration that never had their true
-- owner determined. This query alone CANNOT distinguish the two -- see the
-- accompanying report for why (the migration didn't preserve any trace of
-- the original owner, if one was ever known).
SELECT
  dp.id, dp.slug, dp.title, dp.is_active, dp.created_by, dp.created_at,
  t.code AS tenant_code
FROM display_pages dp
JOIN tenant t ON t.id = dp.tenant_id
WHERE t.code = 'default'
ORDER BY dp.created_at;

-- 5. All slugs that exist in multiple tenants
-- Expected and allowed under the current schema (composite unique key is
-- (tenant_id, slug), not slug alone) -- this is informational, not
-- necessarily a problem, but worth knowing about before switching the
-- canonical URL, since it's the scenario the old global lookup couldn't
-- handle correctly.
SELECT
  slug,
  COUNT(DISTINCT tenant_id) AS tenant_count,
  array_agg(DISTINCT tenant_id) AS tenant_ids
FROM display_pages
GROUP BY slug
HAVING COUNT(DISTINCT tenant_id) > 1
ORDER BY tenant_count DESC;

-- 6. All (tenant_id, slug) duplicates
-- Expected 0 -- the composite UNIQUE (tenant_id, slug) constraint added by
-- migration 1790900000001 should make this structurally impossible once
-- applied. A non-zero result here would indicate either the constraint is
-- missing/was dropped, or rows were inserted through a path that bypassed
-- it (e.g. a raw SQL script, not the TypeORM repository).
SELECT tenant_id, slug, COUNT(*) AS row_count
FROM display_pages
GROUP BY tenant_id, slug
HAVING COUNT(*) > 1;

-- 7. DisplayPages whose tenant no longer exists (orphaned FK)
-- There's no DB-level foreign key from display_pages.tenant_id to tenant.id
-- (per the entity's own doc history), so this can't be caught by a
-- constraint -- only by this query. Any rows returned here are currently
-- unreachable via findByTenantAndSlug() for ANY tenant code and would also
-- have been invisible to the migration's duplicate-slug check if the
-- orphaned tenant_id happened to collide with a real one.
SELECT dp.id, dp.slug, dp.title, dp.tenant_id, dp.created_at
FROM display_pages dp
LEFT JOIN tenant t ON t.id = dp.tenant_id
WHERE t.id IS NULL;

-- 8. DisplayPages whose tenant code/status is invalid
-- "Invalid" here means the owning tenant row exists but is not 'active'
-- (tenant.status is 'active' | 'inactive' per tenant.entity.ts) -- i.e. the
-- display would technically resolve via findByTenantAndSlug() but points
-- at a deprovisioned/inactive tenant that shouldn't currently be serving
-- traffic (see tenant.entity.ts's subdomain-release-lifecycle doc comment).
SELECT dp.id, dp.slug, dp.title, dp.tenant_id, t.code, t.status
FROM display_pages dp
JOIN tenant t ON t.id = dp.tenant_id
WHERE t.status IS NULL OR t.status NOT IN ('active');
