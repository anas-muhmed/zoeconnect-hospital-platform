// Single source of truth for which columns are real BOOLEAN in Postgres
// but were NUMBER(1) 0/1 flags in Oracle (see migration/docs/schema-mapping.md).
// Previously duplicated independently across migrate_synthetic_to_postgres.mjs,
// migrate_real_to_postgres.mjs, and routes/auth.js's conversion -- centralized
// here so the list can't drift as more routes get converted.

export const PG_BOOLEAN_COLUMNS = new Set([
  'is_active', 'is_approved', 'force_password_reset', 'temp_password_issued',
  'cost_reduction_benefit', 'is_emergency', 'is_reverted', 'approved_by_hod',
  'inventory_added', 'inventory_received', 'is_final_selected', 'is_read',
]);
