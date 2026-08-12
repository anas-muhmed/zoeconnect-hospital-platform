-- ============================================================================
-- fix_attendance_performance_indexes.sql  (v3 — final, after full ATTLOGS audit)
-- ----------------------------------------------------------------------------
-- Audit results (2026-07-04):
--   ATTLOGS: 1,087,968 rows, ZERO indexes.
--   LOGDATETIME  = VARCHAR2   (business punch time, 'DD-MM-YYYY HH24:MI:SS')
--   CREATEDDATETIME = TIMESTAMP(6), fully populated (0 NULLs) — insert time.
--   EMPLOYEE.EMPNO: not indexed.
--   DUTYPLANVALUES.PLANDATE, DUTYACTUALVALUES.EMPID/ACTUALDATE: already indexed
--     (served by the app-side TRUNC() rewrites; no new indexes needed).
--
-- Strategy (v3): the function-based-index idea is ABANDONED. The poller now
-- cursors on CREATEDDATETIME (plain B-tree index below) and reads LOGDATETIME
-- only as the business punch time on the <=500 rows per batch. Late-uploaded
-- punches can no longer be missed, since polling follows insert order.
-- ============================================================================

-- ─── STEP 0: sanity check before the code change ────────────────────────────
-- Verify CREATEDDATETIME is the insert timestamp (≈ punch time for live
-- uploads). Expect pairs like:  04-07-2026 08:31:05  /  2026-07-04 08:31:06.2
SELECT LOGDATETIME, CREATEDDATETIME
FROM   ATTLOGS
WHERE  ROWNUM <= 20
ORDER  BY CREATEDDATETIME DESC;

-- How far apart can they drift? (large lag = delayed device uploads; harmless
-- for the cursor, but good to know for monitoring)
SELECT MAX(CAST(CREATEDDATETIME AS DATE)
         - TO_DATE(LOGDATETIME, 'DD-MM-YYYY HH24:MI:SS')) * 24 * 60 AS max_lag_minutes
FROM   ATTLOGS
WHERE  CREATEDDATETIME > SYSTIMESTAMP - 7;

-- ─── STEP 1: THE fix — index the polling cursor column ──────────────────────
CREATE INDEX IDX_ATTLOGS_CREATEDDATETIME ON ATTLOGS (CREATEDDATETIME) ONLINE;

-- ─── STEP 2: EMPLOYEE.EMPNO (recommended) ───────────────────────────────────
-- Roster resolution runs WHERE e.EMPNO = :employeeCode once per punch
-- (roster-resolver.service.ts). EMPNO is confirmed unindexed.
CREATE INDEX IDX_EMPLOYEE_EMPNO ON EMPLOYEE (EMPNO) ONLINE;

-- ─── STEP 3: dependency pollers (60s cadence) — check, then create if absent ─
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
FROM   USER_IND_COLUMNS
WHERE  TABLE_NAME IN ('DUTYPLANVALUES','EMPLOYEELEAVELIST')
AND    COLUMN_NAME = 'LASTMODIFIEDDATE';
-- Only if missing for the respective table:
-- CREATE INDEX IDX_DUTYPLANVALUES_LASTMOD ON DUTYPLANVALUES    (LASTMODIFIEDDATE) ONLINE;
-- CREATE INDEX IDX_EMPLEAVELIST_LASTMOD   ON EMPLOYEELEAVELIST (LASTMODIFIEDDATE) ONLINE;

-- ─── STEP 4: refresh optimizer statistics ───────────────────────────────────
BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(USER, 'ATTLOGS',  cascade => TRUE, no_invalidate => FALSE);
  DBMS_STATS.GATHER_TABLE_STATS(USER, 'EMPLOYEE', cascade => TRUE, no_invalidate => FALSE);
END;
/

-- ─── STEP 5: verify BEFORE re-enabling ATTENDANCE_REALTIME_ENABLED ──────────
-- This mirrors the rewritten poller query. The plan MUST show
-- INDEX RANGE SCAN on IDX_ATTLOGS_CREATEDDATETIME and no TABLE ACCESS FULL.
EXPLAIN PLAN FOR
SELECT * FROM (
  SELECT EMPLOYEECODE,
         TO_DATE(LOGDATETIME, 'DD-MM-YYYY HH24:MI:SS') AS LOGDT,
         CREATEDDATETIME
  FROM   ATTLOGS
  WHERE  CREATEDDATETIME >= SYSTIMESTAMP - 1
  ORDER  BY CREATEDDATETIME ASC
) WHERE ROWNUM <= 500;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- ─── Withdrawn (v1/v2 ideas, do NOT run) ────────────────────────────────────
--   ✗ Function-based index on TO_DATE(LOGDATETIME, ...) — obsolete; the poller
--     no longer filters/sorts on that expression.
--   ✗ IDX_DUTYPLAN_EMP_DATE / IDX_DUTYACTUAL_EMP_DATE — existing single-column
--     indexes suffice now that TRUNC(column) predicates were removed.
--   ✗ APPLIEDLEAVES composite — defer unless post-deploy plans show a hotspot.
-- ============================================================================
-- Rollout order:
--   1. Run Steps 0–5 on the HIS DB (low-traffic window; indexes are ONLINE).
--   2. Deploy the updated backend (CREATEDDATETIME cursor + TRUNC rewrites).
--   3. Confirm vendor-portal config: 'attendance.attlogs.createdAt' must be
--      CREATEDDATETIME (new code default) — remove any LOGDATEBKP override.
--   4. Set ATTENDANCE_PUNCH_START_DATE, keep poll interval >= 15000 ms.
--   5. Enable ATTENDANCE_REALTIME_ENABLED during a quiet period; watch Oracle
--      session activity for 15 minutes.
-- ============================================================================
