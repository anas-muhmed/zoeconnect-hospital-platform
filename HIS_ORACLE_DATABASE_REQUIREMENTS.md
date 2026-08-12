# HIS Oracle Database Requirements

What HDSP actually queries (and writes) against a hospital's on-prem
Oracle HIS database, derived directly from the backend's source code --
not from a generic template. Intended audience: whoever configures a new
hospital's HIS Config (vendor portal) and/or the hospital's own Oracle
DBA, who needs to know what access to grant and (for two specific
tables) what to create.

There are two fundamentally different categories here, and conflating
them is the most common source of confusion, so this doc keeps them
strictly separate:

- **Category A -- Dynamic, config-driven queries.** HDSP does not assume
  any particular table or column name for patients, visits, billing, or
  reference data. Every hospital's HIS uses different naming (`PAT_MASTER`
  vs `PATIENT_MST` vs anything else) -- so the actual table/column names
  are supplied per-tenant via the vendor portal's HIS Config screen, and
  HDSP compiles its SQL against whatever names you provide. This doc
  shows the SQL *shape*, with the configurable table/column identified.
- **Category B -- Fixed-name integrations.** A small number of
  integrations assume a literal, hardcoded table name in every hospital's
  Oracle instance. Two of these (`PRINT_DATA_DETAIL`,
  `LOYALTY_PATIENT_SUMMARY`) are tables **HDSP itself expects to write
  into** and that likely don't exist yet in a hospital's schema -- they
  need to be created once, by the hospital's DBA, before those features
  work. The rest (`EMPLOYEE`, `HISUSER`, `hisdepartment`, `servicecenter`)
  are assumed to already exist as native HIS tables under exactly that
  name.

---

## Category A: Dynamic, config-driven queries

Source of truth: `backend/src/modules/his/config/his-query-template-compiler.service.ts`
(the registry of every `queryId`) plus `backend/src/modules/his/config/query-templates/*.ts`
(the actual SQL builders) and `backend/src/modules/his/config/his-config.helpers.ts`
(the FK-lookup-join convention). See `DYNAMIC_HIS_QUERY_ARCHITECTURE.md`
for the full design rationale -- this section is just "what SQL actually
runs," not the design doc.

**How configuration works:** for each domain (`patient`, `visit`,
`billing`, `billItems`, `department`, `doctor`), the vendor portal HIS
Config screen collects `<domain>.table` (the real table name) and
`<domain>.col.<field>` (the real column name) for every field HDSP needs.
If a field is stored as a foreign key into a lookup/master table rather
than a plain value (a very common HIS pattern -- e.g. `PREFIX_ID` instead
of a plain `SALUTATION` string), four additional keys
(`<domain>.lookup.<field>.table/.fk/.value`) tell HDSP to emit a `LEFT
JOIN` instead of reading the column directly. Every hospital's actual
Oracle table/column names go here -- nothing below is a fixed name.

A tenant can also override any of these with fully raw, hand-written SQL
(`sql.<domain>.<operation>`, e.g. `sql.patient.getByMrn`) if the
config-driven builder can't express something that hospital's schema
needs -- HDSP compiles that verbatim instead.

### 1. `patient.getByMrn` -- single patient lookup by MRN

Binds: `mrn`

```sql
SELECT
  p.<mrn>        AS "mrn",
  <salutation>   AS "salutation",   -- plain column OR lookup-joined
  p.<firstName>  AS "firstName",
  p.<middleName> AS "middleName",
  p.<lastName>   AS "lastName",
  TRIM(<salutation> || ' ' || p.<firstName> || ' ' || NVL(p.<middleName>, '') || ' ' || p.<lastName>) AS "fullName",
  <gender>       AS "gender",       -- plain column OR lookup-joined
  TO_CHAR(p.<dob>, 'YYYY-MM-DD') AS "dateOfBirth",
  FLOOR(MONTHS_BETWEEN(SYSDATE, p.<dob>) / 12) AS "age",
  <bloodGroup>   AS "bloodGroup",   -- plain column OR lookup-joined
  p.<mobile>     AS "mobile",
  p.<email>      AS "email",
  p.<address>    AS "address",
  p.<city>       AS "city",
  p.<state>      AS "state",
  p.<pinCode>    AS "pinCode",
  SUBSTR(p.<aadhaar>, -4) AS "aadhaarLast4",
  TO_CHAR(p.<regDate>, 'YYYY-MM-DD') AS "registrationDate",
  CASE WHEN p.<status> = '<active status value>' THEN 1 ELSE 0 END AS "isActiveFlag"
FROM <patient.table> p
[LEFT JOIN <salutation lookup table> ...]
[LEFT JOIN <gender lookup table> ...]
[LEFT JOIN <bloodGroup lookup table> ...]
WHERE p.<mrn> = :mrn
```

Config keys needed: `patient.table`, `patient.col.{mrn,firstName,
middleName,lastName,dob,mobile,email,address,city,state,pinCode,aadhaar,
regDate,status}`, `patient.status.active`, plus optional
`patient.col.{salutation,gender,bloodGroup}` and their matching
`patient.lookup.*` keys if those are FK-backed in your schema.

### 2. `patient.search` -- patient lookup by MRN, mobile, or name

Binds: `term`, `nameMatch`

```sql
SELECT
  p.<mrn>       AS "mrn",
  TRIM(p.<firstName> || ' ' || NVL(p.<middleName>, '') || ' ' || p.<lastName>) AS "fullName",
  <gender>      AS "gender",
  TO_CHAR(p.<dob>, 'YYYY-MM-DD') AS "dateOfBirth",
  p.<mobile>    AS "mobile",
  TO_CHAR(p.<regDate>, 'YYYY-MM-DD') AS "registrationDate"   -- omitted if regDate not configured
FROM <patient.table> p
[LEFT JOIN <gender lookup table> ...]
WHERE p.<mrn> = :term
   OR UPPER(p.<mobile>) = :term
   OR UPPER(TRIM(p.<firstName> || ' ' || NVL(p.<middleName>, '') || ' ' || p.<lastName>)) LIKE :nameMatch
[ORDER BY p.<regDate> DESC]   -- omitted if regDate not configured
```

### 3. `visit.getByMrn` -- a patient's visit history

Binds: `mrn`, `lim`, `visitType` (pass `null` for "all types")

```sql
SELECT
  v.<visitId>       AS "visitId",
  v.<mrn>           AS "mrn",
  TO_CHAR(v.<visitDate>, 'YYYY-MM-DD"T"HH24:MI:SS')      AS "visitDate",
  <visitType>                                              AS "visitType",
  TO_CHAR(v.<admissionDate>, 'YYYY-MM-DD"T"HH24:MI:SS')  AS "admissionDate",
  TO_CHAR(v.<dischargeDate>, 'YYYY-MM-DD"T"HH24:MI:SS')  AS "dischargeDate",
  v.<doctorCode>    AS "doctorCode",
  <doctorName>                                              AS "doctorName",
  v.<deptCode>      AS "departmentCode",
  <deptName>                                                AS "departmentName",
  <ward>                                                    AS "ward",
  v.<bed>           AS "bed",
  v.<diagnosis>     AS "diagnosis",
  v.<status>        AS "status"
FROM <visit.table> v
[LEFT JOIN visitType/ward/dept/doctor lookup tables ...]
WHERE v.<mrn> = :mrn
  AND (:visitType IS NULL OR v.<visitType> = :visitType)
ORDER BY v.<visitDate> DESC
FETCH FIRST :lim ROWS ONLY
```

Config keys needed: `visit.table`, `visit.col.{visitId,mrn,visitDate,
admissionDate,dischargeDate,doctorCode,deptCode,bed,diagnosis,status,
visitType}`, plus optional lookup keys for `visitType`/`ward`/`dept`/`doctor`.

### 4. `billing.getBillsByMrn` -- a patient's bill list

Binds: `mrn`, `lim`

```sql
SELECT * FROM (
  SELECT
    b.<billId>          AS "billId",
    b.<mrn>             AS "mrn",
    b.<patientName>     AS "patientName",
    b.<visitId>         AS "visitId",
    TO_CHAR(b.<billDate>, 'YYYY-MM-DD"T"HH24:MI:SS') AS "billDate",
    b.<billType>        AS "billType",
    b.<totalAmount>     AS "totalAmount",
    b.<paidAmount>      AS "paidAmount",
    b.<balanceAmount>   AS "balanceAmount",
    b.<discountAmount>  AS "discountAmount",
    b.<status>          AS "status",
    b.<doctorCode>      AS "doctorCode",
    <doctorName>                            AS "doctorName",
    b.<deptCode>        AS "departmentCode",
    <deptName>                              AS "departmentName"
  FROM <billing.table> b
  WHERE b.<mrn> = :mrn
  ORDER BY b.<billDate> DESC
) WHERE ROWNUM <= :lim
```

### 5. `billing.getBillById` -- one bill's header

Binds: `billId` (`mrn`/`lim` declared but unused unless a raw override is set)

Same SELECT shape as #4, filtered by `WHERE b.<billId> = :billId` instead
of MRN/ROWNUM.

### 6. `billing.getLineItems` -- one bill's line items

Binds: `billId`

```sql
SELECT
  bi.<itemCode>   AS "itemCode",
  bi.<itemName>   AS "itemName",
  bi.<quantity>   AS "quantity",
  bi.<unitPrice>  AS "unitPrice",
  bi.<amount>     AS "amount",
  bi.<deptCode>   AS "departmentCode",
  bi.<deptName>   AS "departmentName"
FROM <billItems.table> bi
WHERE bi.<billId> = :billId
ORDER BY bi.<serialNo>
```

Config keys needed: `billItems.table`, `billItems.col.{itemCode,itemName,
quantity,unitPrice,amount,deptCode,deptName,billId,serialNo}`. Note this
is a *separate* configured table from `billing.table` -- a bill header
table and a bill line-items table are typically different tables in most
HIS schemas.

### 7 & 8. `reference.departments` / `reference.doctors`

Binds: `activeOnly` (0/1) / `deptCode` (string or `null`)

```sql
-- reference.departments
SELECT
  d.<code> AS "departmentCode", d.<name> AS "departmentName",
  d.<shortCode> AS "shortCode", <type> AS "type",
  CASE WHEN d.<status> = '<active>' THEN 1 ELSE 0 END AS "isActiveFlag"
FROM <department.table> d
[LEFT JOIN type lookup table ...]
WHERE (:activeOnly = 0 OR d.<status> = '<active>')
ORDER BY d.<name>

-- reference.doctors
SELECT
  doc.<code> AS "doctorCode", doc.<name> AS "doctorName",
  <specialization> AS "specialization", doc.<deptCode> AS "departmentCode",
  <deptName> AS "departmentName", doc.<qualification> AS "qualification",
  CASE WHEN doc.<status> = '<active>' THEN 1 ELSE 0 END AS "isActiveFlag"
FROM <doctor.table> doc
[LEFT JOIN specialization/dept lookup tables ...]
WHERE doc.<status> = '<active>'
  AND (:deptCode IS NULL OR doc.<deptCode> = :deptCode)
ORDER BY doc.<name>
```

Config keys needed: `department.table`, `department.col.{code,name,
shortCode,status}`, `department.status.active`, optional `type` lookup;
`doctor.table`, `doctor.col.{code,name,qualification,deptCode,status}`,
`doctor.status.active`, optional `specialization`/`dept` lookups.

---

## Category B: Fixed-name integrations

These do NOT go through the HIS Config screen -- the table/column names
below are literal, hardcoded strings in the backend source. Access
(grants, or table creation) needs to be arranged directly, not through
per-tenant configuration.

### `EMPLOYEE` -- read-only, assumed to already exist

Referenced from `ReferenceService.getEmployees()`
(`backend/src/modules/his/reference/reference.service.ts`) and again from
`ReferenceService.getUserContext()` and the Attendance module's
`retroactive-recalculation.service.ts`. Columns assumed:

```sql
SELECT empno AS "employeeCode", employee_name AS "employeeName"
FROM EMPLOYEE
WHERE emp_status = 75
[AND UPPER(employee_name) LIKE :search]
ORDER BY employee_name
```

Required columns: `EMPNO`, `EMPLOYEE_NAME`, `EMP_STATUS` (with `75`
meaning "active" in this HIS convention -- confirm this status code
matches the target hospital's actual HIS, since `75` is specific to
whatever HIS product this constant originated from), plus `EMPLOYEE_ID`
(joined against `HISUSER`, see below) and `DEPT_ID` (used by Attendance's
`retroactive-recalculation.service.ts`).

This can be overridden per-tenant via `sql.reference.employees` in HIS
Config if a hospital's actual employee table has a different name --
but unlike Category A, there's no dedicated `employee.table`/
`employee.col.*` config convention; it's an all-or-nothing raw SQL
override.

### `HISUSER` -- read-only, assumed to already exist

Referenced from `ReferenceService.getUserContext()` -- resolves which
employee is logged into a HIS workstation, for Registration Assistant
identity mapping:

```sql
SELECT u.USERNAME AS "username", e.EMPNO AS "employeeCode"
FROM HISUSER u
LEFT JOIN EMPLOYEE e ON e.EMPLOYEE_ID = u.EMPLOYEE_ID
WHERE u.USERNAME = :username
  AND u.ISACTIVE = 1
```

Required columns: `USERNAME`, `EMPLOYEE_ID`, `ISACTIVE`. Overridable via
`sql.reference.userContext`.

### `PRINT_DATA_DETAIL` -- **HDSP writes here; create this table**

Referenced from `HisTokenBridgeService`
(`backend/src/modules/his/token/his-token-bridge.service.ts`), which
inserts a row every time a token is issued at a kiosk/counter -- this is
how the HIS side of a hospital sees HDSP's Token Queue activity. This
table does not need to pre-exist as a native HIS table; it's an
HDSP-owned bridge table that needs to be created once:

```sql
CREATE TABLE PRINT_DATA_DETAIL (
  ID             NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  TOKEN_NUMBER   NUMBER(10)    NOT NULL,
  LOCATION_ID    VARCHAR2(100) NOT NULL,
  LOCATION_CODE  VARCHAR2(50)  NOT NULL,
  LOCATION_NAME  VARCHAR2(255) NOT NULL,
  PRINTED_AT     TIMESTAMP     NOT NULL,
  CREATED_AT     TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX IDX_PDD_LOCATION ON PRINT_DATA_DETAIL (LOCATION_ID);
CREATE INDEX IDX_PDD_PRINTED  ON PRINT_DATA_DETAIL (PRINTED_AT);
```

The HIS side would read it as:

```sql
SELECT * FROM PRINT_DATA_DETAIL
WHERE LOCATION_ID = :locationId
ORDER BY PRINTED_AT DESC
```

This DDL is copied directly from that service file's own doc comment --
it is the exact schema HDSP's insert statement expects, not a
reconstruction.

### `hisdepartment` / `servicecenter` -- read-only, assumed to already exist

Also referenced from `HisTokenBridgeService`, for the kiosk configuration
screen's department/service-center dropdowns:

```sql
SELECT department_id, department_name, intrabranchid
FROM hisdepartment
WHERE active = 1
  AND intrabranchid = :intrabranchId

SELECT service_center_id, service_center_name, department_id, intrabranchid
FROM servicecenter
WHERE active = 1
  AND intrabranchid = :intrabranchId
  [AND department_id = :departmentId]
```

Required columns: `hisdepartment(department_id, department_name, active,
intrabranchid)`; `servicecenter(service_center_id, service_center_name,
department_id -- confirmed to sometimes actually be named just
`department` in real HIS instances, see the source file's own comment
about a prior ORA-00904 bug from assuming the wrong name -- `active`,
`intrabranchid`)`.

### `LOYALTY_PATIENT_SUMMARY` -- **HDSP writes here; create this table**

Referenced from `HisLoyaltyBridgeService`
(`backend/src/modules/his/billing/his-loyalty-bridge.service.ts`).
Another HDSP-owned bridge table (not a native HIS table) -- kept in sync
with the Loyalty module's own Postgres state after every points
earn/redeem, so the HIS-side billing UI can see current loyalty status
without querying HDSP's Postgres directly. Needs to be created:

```sql
CREATE TABLE LOYALTY_PATIENT_SUMMARY (
  PATIENT_MRN           VARCHAR2(50)  PRIMARY KEY,
  PATIENT_NAME          VARCHAR2(255),
  CARD_NUMBER           VARCHAR2(50),
  TIER_CODE             VARCHAR2(20),   -- SILVER | GOLD | PLATINUM
  TIER_NAME             VARCHAR2(50),
  TOTAL_LIFETIME_SPEND  NUMBER(14,2),
  TOTAL_POINTS_EARNED   NUMBER(14,2),
  TOTAL_POINTS_REDEEMED NUMBER(14,2),
  AVAILABLE_POINTS      NUMBER(14,2),
  REDEEMABLE_AMOUNT     NUMBER(14,2),
  DISCOUNT_PCT          NUMBER(5,2),
  LAST_BILL_ID          VARCHAR2(50),
  LAST_BILL_AMOUNT      NUMBER(14,2),
  LAST_BILL_DATE        TIMESTAMP,
  LAST_TXN_TYPE         VARCHAR2(20),   -- EARN | REDEEM | ADJUST | REVERSE
  LOYALTY_STATUS        VARCHAR2(20),   -- ACTIVE | SUSPENDED | CLOSED
  LAST_UPDATED          TIMESTAMP,
  CREATED_AT            TIMESTAMP DEFAULT SYSTIMESTAMP
);
```

This column list is reconstructed from `HisLoyaltyBridgeService`'s actual
`MERGE INTO` statement (both the `UPDATE SET` and `INSERT` column lists),
not guessed -- every column named above is one the running code writes
to. Sizes/precision above (`VARCHAR2(50)`, `NUMBER(14,2)`, etc.) are
reasonable defaults inferred from the data, not copied from an existing
DDL in the codebase -- confirm against your own conventions before
creating this table, since the source doesn't pin exact column widths.

The HIS side would read it as:

```sql
SELECT * FROM LOYALTY_PATIENT_SUMMARY WHERE PATIENT_MRN = :mrn
```

### `INS_MASTER_INVOICE` -- optional, diagnostic-only

Referenced only inside `HisSyncService.diagnose()`
(`backend/src/modules/his/sync/his-sync.service.ts`), a health-check
endpoint that does a row count and a sample of `INVOICE_STATUS` values as
a sanity probe when troubleshooting the (fully tenant-configured, raw-SQL)
billing sync feature (`sql.billing.sync`). This is not a hard runtime
dependency -- if this table doesn't exist or the probe query fails, only
`diagnose()`'s optional diagnostic block is affected (caught and reported
as `testQueryError`, not thrown), not the actual billing sync itself. Not
worth creating or granting access to unless you're specifically using
that diagnostic endpoint.

---

## Attendance / HRMS module (separate, optional subsystem)

If the hospital's license includes the Attendance module, there is a
whole second, parallel config-driven system for duty rosters, shift
types, leave, holidays, and biometric punch data -- same "you tell us
your real table/column names" pattern as Category A above, just with its
own config-key prefix (`attendance.*`) and its own service,
`backend/src/modules/attendance/services/attendance-config.service.ts`.
Confirmed table concepts, one per config key (exact names come from that
tenant's `attendance.*` config, not fixed by HDSP): duty roster table,
shift-type table, leave-master table, applied-leave table,
employee-leave-link table, biometric/actual-duty table, holiday table,
and a service-center-master table -- plus `EMPLOYEE` again (see Category
B; `retroactive-recalculation.service.ts` queries it directly by name,
unlike everything else in this module which goes through configured
identifiers).

This subsystem is intentionally not fully enumerated table-by-table here
-- it's large enough (9 distinct config-driven table roles across 8+
poller/service files) to warrant its own document if a specific hospital
pilot actually needs it, and it's gated behind Attendance being licensed
at all (self-hosted cloud deployments disable it entirely per Task #34).
If a pilot needs Attendance, the right next step is reading
`attendance-config.service.ts` directly for the exact key catalog rather
than trusting a paraphrase of it here.

---

## Summary table

| Table | Read/Write | Fixed name or configurable | Feature |
|---|---|---|---|
| *(patient table)* | Read | Configurable (`patient.table`) | Patient lookup/search |
| *(visit table)* | Read | Configurable (`visit.table`) | Visit history |
| *(billing table)* | Read | Configurable (`billing.table`) | Bill list/detail |
| *(bill items table)* | Read | Configurable (`billItems.table`) | Bill line items |
| *(department table)* | Read | Configurable (`department.table`) | Department reference data |
| *(doctor table)* | Read | Configurable (`doctor.table`) | Doctor reference data |
| *(assorted lookup/master tables)* | Read | Configurable (`*.lookup.*.table`) | FK-to-display-name resolution |
| `EMPLOYEE` | Read | Fixed | Employee lookup, HIS user context, Attendance |
| `HISUSER` | Read | Fixed | HIS workstation user identity |
| `PRINT_DATA_DETAIL` | **Write** | Fixed -- **create this table** | Token Queue -> HIS bridge |
| `hisdepartment` | Read | Fixed | Token Queue kiosk config |
| `servicecenter` | Read | Fixed | Token Queue kiosk config |
| `LOYALTY_PATIENT_SUMMARY` | **Write** | Fixed -- **create this table** | Loyalty -> HIS bridge |
| `INS_MASTER_INVOICE` | Read | Fixed, optional | Diagnostic probe only |
| *(9 attendance-related tables)* | Read | Configurable (`attendance.*`) | Attendance/HRMS (if licensed) |

## Practical next step for a hospital's Oracle DBA

1. Grant read access on whatever tables map to Category A's patient,
   visit, billing, bill-items, department, and doctor concepts (exact
   names TBD per hospital -- that's what the HIS Config screen captures).
2. Grant read access on `EMPLOYEE` and `HISUSER` (Category B, fixed
   names) -- these must already exist under exactly those names, or a
   `sql.reference.employees`/`sql.reference.userContext` override is
   needed instead.
3. Grant read access on `hisdepartment` and `servicecenter` if the Token
   Queue kiosk feature is in scope for this hospital.
4. **Create** `PRINT_DATA_DETAIL` (DDL above) if Token Queue is in scope,
   and grant HDSP's Oracle user INSERT/SELECT on it.
5. **Create** `LOYALTY_PATIENT_SUMMARY` (DDL above, confirm column
   widths first) if the Loyalty module is in scope, and grant HDSP's
   Oracle user MERGE/INSERT/UPDATE/DELETE/SELECT on it (the bridge
   service's own test-write path does a delete of a synthetic test row).
