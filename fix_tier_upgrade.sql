-- ============================================================
-- HDSP: Check tier config and bulk-correct account tiers
-- Run this AFTER restarting the backend (new determineTier fix)
-- ============================================================

-- 1. Show current tier configuration
SELECT code, name, min_spend, max_spend, earn_rate_per_100, display_order
FROM card_categories
ORDER BY display_order;

-- 2. Bulk-update account tiers based on total_lifetime_spend + correct minSpend thresholds
-- This fixes all accounts that are on the wrong tier RIGHT NOW without waiting for the sync.
UPDATE loyalty_accounts la
SET card_category_id = (
  SELECT id FROM card_categories cc
  WHERE cc.is_active = true
    AND la.total_lifetime_spend >= cc.min_spend
  ORDER BY cc.min_spend DESC
  LIMIT 1
);

-- 3. Verify: show tier distribution after fix
SELECT
  cc.name AS tier,
  COUNT(*) AS account_count,
  SUM(la.total_lifetime_spend) AS total_spend,
  AVG(la.available_points) AS avg_points
FROM loyalty_accounts la
JOIN card_categories cc ON cc.id = la.card_category_id
GROUP BY cc.name
ORDER BY MIN(cc.min_spend) DESC;

-- 4. Double-check: who should be Gold/Platinum but is still Silver?
SELECT la.patient_mrn, la.patient_name, la.total_lifetime_spend, cc.name AS current_tier
FROM loyalty_accounts la
JOIN card_categories cc ON cc.id = la.card_category_id
WHERE la.total_lifetime_spend > (SELECT min_spend FROM card_categories WHERE code = 'SILVER' ORDER BY min_spend DESC LIMIT 1)
  AND cc.code = 'SILVER'
LIMIT 10;
