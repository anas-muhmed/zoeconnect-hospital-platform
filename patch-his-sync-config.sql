-- HDSP: Add sql.billing.syncAll + fix cursor column in sql.billing.sync
-- Run via: docker cp patch-his-sync-config.sql hdsp_postgres:/tmp/ && docker exec hdsp_postgres psql -U hdsp_app -d hdsp_db -f /tmp/patch-his-sync-config.sql

-- 1. Add the all-status sync query (captures Settled + Cancelled)
INSERT INTO his_schema_configs (config_key, config_value, updated_at)
VALUES (
  'sql.billing.syncAll',
  'SELECT
  B.INVOICE_NO                                             AS "billId",
  P.MRNO                                                   AS "mrn",
  P.PATIENTNAME                                            AS "patientName",
  B.VISIT_ID                                               AS "visitId",
  TO_CHAR(B.CREATEDDATETIME,''YYYY-MM-DD"T"HH24:MI:SS'') AS "billDate",
  B.INVOICE_COLLECTION_TYPE                                AS "billType",
  B.AMOUNT_TOBEPAIDBYPATIENT                               AS "totalAmount",
  B.PATIENT_AMOUNT                                         AS "paidAmount",
  (B.AMOUNT_TOBEPAIDBYPATIENT - B.PATIENT_AMOUNT)          AS "balanceAmount",
  B.DISCOUNT_AMT                                           AS "discountAmount",
  B.INVOICE_STATUS                                         AS "status",
  E.EMPNO                                                  AS "doctorCode",
  E.EMPLOYEE_NAME                                          AS "doctorName",
  H.DEPARTMENT_CODE                                        AS "departmentCode",
  H.DEPARTMENT_NAME                                        AS "departmentName"
FROM INS_MASTER_INVOICE B
INNER JOIN PATIENT P ON P.PATIENT_ID = B.PATIENT_ID
INNER JOIN EMPLOYEE E ON E.EMPLOYEE_ID = B.CONSULTANT_ID
INNER JOIN HISDEPARTMENT H ON H.DEPARTMENT_ID = E.DEPARTMENT_ID
WHERE B.INVOICE_STATUS IN (''Settled'', ''Cancelled'')
  AND B.UPDATEDDATETIME > :since
ORDER BY B.UPDATEDDATETIME ASC
FETCH FIRST :lim ROWS ONLY',
  NOW()
)
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      updated_at   = NOW();

-- 2. Fix cursor column in existing sql.billing.sync (CREATEDDATETIME -> UPDATEDDATETIME)
UPDATE his_schema_configs
SET config_value = REPLACE(
                    REPLACE(config_value,
                      'CREATEDDATETIME > :since',  'UPDATEDDATETIME > :since'),
                      'CREATEDDATETIME > :SINCE',  'UPDATEDDATETIME > :SINCE')
WHERE config_key = 'sql.billing.sync';

-- 3. Add status value mappings so the sync dispatcher recognises 'Settled' / 'Cancelled'
INSERT INTO his_schema_configs (config_key, config_value, updated_at) VALUES
  ('billing.status.finalised', 'Settled',   NOW()),
  ('billing.status.cancelled', 'Cancelled', NOW())
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      updated_at   = NOW();

-- Verify
SELECT config_key, LEFT(config_value, 60) AS value_preview
FROM his_schema_configs
WHERE config_key IN (
  'sql.billing.sync',
  'sql.billing.syncAll',
  'billing.status.finalised',
  'billing.status.cancelled'
)
ORDER BY config_key;
