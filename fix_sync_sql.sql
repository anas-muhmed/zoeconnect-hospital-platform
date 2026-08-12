UPDATE his_schema_configs
SET config_value =
'SELECT
  b.INVOICE_NO                                              AS "billId",
  p.MRNO                                                    AS "mrn",
  p.patientname                                             AS "patientName",
  b.VISIT_ID                                                AS "visitId",
  TO_CHAR(b.CREATEDDATETIME,''YYYY-MM-DD"T"HH24:MI:SS'')   AS "billDate",
  b.INVOICE_COLLECTION_TYPE                                 AS "billType",
  b.AMOUNT_TOBEPAIDBYPATIENT                                AS "totalAmount",
  b.PATIENT_AMOUNT                                          AS "paidAmount",
  (b.AMOUNT_TOBEPAIDBYPATIENT-b.PATIENT_AMOUNT)             AS "balanceAmount",
  b.DISCOUNT_AMT                                            AS "discountAmount",
  b.INVOICE_STATUS                                          AS "status",
  e.empno                                                   AS "doctorCode",
  e.employee_name                                           AS "doctorName",
  h.department_code                                         AS "departmentCode",
  h.department_name                                         AS "departmentName"
FROM ins_master_invoice b
INNER JOIN patient p ON p.PATIENT_ID=b.patient_id
INNER JOIN employee e ON e.employee_id=b.consultant_id
INNER JOIN hisdepartment h ON h.department_id=e.department_id
WHERE b.INVOICE_STATUS = ''Settled''
  AND b.INVOICE_STATUS NOT IN (''Cancelled'',''REVERSED'')
  AND b.CREATEDDATETIME > :SINCE
ORDER BY b.CREATEDDATETIME ASC
FETCH FIRST :LIM ROWS ONLY'
WHERE config_key = 'sql.billing.sync';
