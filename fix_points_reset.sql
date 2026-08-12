-- ============================================================
-- HDSP Loyalty Points Reset
-- Fixes:
--   1. available_points corrupted by numeric string-concat bug
--   2. Orphaned transactions from old account IDs (table was
--      recreated between sync runs, leaving stale account_ids)
-- After this script: restart backend. The scheduler will
-- re-process all bills from 2000-01-01 and correctly
-- accumulate points using Number() coercion fix.
-- ============================================================

BEGIN;

-- 1. Remove transactions tied to CURRENT account IDs so they can
--    be re-generated with the corrected Number() math
DELETE FROM loyalty_transactions
WHERE account_id IN (SELECT id FROM loyalty_accounts);

-- 2. Remove orphaned transactions whose account no longer exists
DELETE FROM loyalty_transactions
WHERE account_id NOT IN (SELECT id FROM loyalty_accounts);

-- 3. Reset all account balances to zero
UPDATE loyalty_accounts SET
  available_points       = 0,
  total_points_earned    = 0,
  total_points_redeemed  = 0,
  total_points_expired   = 0,
  total_lifetime_spend   = 0,
  card_value_balance     = 0,
  last_transaction_at    = NULL,
  card_category_id       = (
    SELECT id FROM card_categories
    WHERE is_active = true
    ORDER BY display_order ASC
    LIMIT 1
  );

-- 4. Reset the HIS sync cursor to start of time so all bills
--    are reprocessed under the current (correct) account IDs
UPDATE his_schema_configs
SET config_value = '2000-01-01T00:00:00.000Z'
WHERE config_key = 'sync.cursor';

-- Verify
SELECT 'loyalty_transactions remaining' AS check_name, COUNT(*) AS cnt FROM loyalty_transactions
UNION ALL
SELECT 'accounts with non-zero points', COUNT(*) FROM loyalty_accounts WHERE available_points > 0
UNION ALL
SELECT 'sync cursor', NULL FROM his_schema_configs WHERE config_key = 'sync.cursor';

SELECT config_value AS sync_cursor FROM his_schema_configs WHERE config_key = 'sync.cursor';

COMMIT;
