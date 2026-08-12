-- ============================================================
-- patch-card-thresholds.sql
-- Fixes card_categories spend thresholds to match client SRS:
--   Silver:   ₹0       → ₹99,999   (entry card, everyone starts here)
--   Gold:     ₹1,00,000 → ₹1,99,999  (upgrade when hitting 1L lifetime spend)
--   Platinum: ₹2,00,000 → no limit   (upgrade when hitting 2L lifetime spend)
--
-- Also fixes earn_rate_per_100 and discount_thresholds key format
-- so they match the entity's DiscountThreshold interface.
--
-- Run:
--   docker exec -i hdsp_postgres psql -U hdsp_app -d hdsp_db < patch-card-thresholds.sql
-- ============================================================

BEGIN;

UPDATE card_categories SET
  min_spend = 0,
  max_spend = 99999.99
WHERE code = 'SILVER';

UPDATE card_categories SET
  min_spend = 100000,
  max_spend = 199999.99
WHERE code = 'GOLD';

UPDATE card_categories SET
  min_spend = 200000,
  max_spend = NULL
WHERE code = 'PLATINUM';

-- Verify
SELECT code, name, min_spend, max_spend, earn_rate_per_100, point_value_per_100,
       discount_thresholds
FROM card_categories
ORDER BY display_order;

COMMIT;
