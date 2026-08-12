import { resolveColumn, buildLookupJoins } from '../his-config.helpers';

/**
 * visit.templates.ts (D.1, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §4/§9).
 *
 * Pure extraction of `VisitService.getVisitsByMrn()`'s inline config-driven
 * SQL builder -- see `patient.templates.ts`'s doc comment for the shared
 * rationale.
 *
 * D.5 fix (2026-07-22): the optional visit-type filter used to be a
 * COMPILE-TIME branch -- `opts.visitType ? "AND v.col = :visitType" : ''` --
 * meaning the SQL TEXT ITSELF differed depending on whether a caller
 * filtered by visit type. That's incompatible with this architecture's
 * "one `queryId` = one canonical, compiled SQL definition" invariant
 * (`HisQueryDefinitionPublisherService` compiles and pushes exactly ONE
 * static SQL string per queryId to the Connector -- it has no per-request
 * parameter awareness). Under `ORACLE_TRANSPORT=cloud_relay`, a caller
 * passing `visitType` would have silently gotten the UNFILTERED variant
 * back (whichever shape happened to be compiled/published), not a
 * filtered result -- caught during D.5's scoping pass, before it could
 * surface as a silent wrong-answer in a real hospital pilot.
 *
 * Fixed by converting the filter from a SQL-shape branch to a bind-value
 * branch: `AND (:visitType IS NULL OR v.col = :visitType)` is now ALWAYS
 * present in the SQL text; `visitType` is always bound (as the real value
 * or `null`), and Oracle's own `IS NULL OR` short-circuit makes the
 * unfiltered case behave identically to omitting the clause. This SQL
 * text no longer varies by caller input at all -- it is a pure function of
 * `cfg` alone, exactly what `HisQueryTemplateCompiler` needs to produce one
 * stable checksum per tenant. Direct-mode behavior is unchanged: the same
 * WHERE semantics, just expressed as a bind check instead of an absent
 * clause (a no-op difference is Oracle's own `IS NULL OR` handling, not a
 * change to which rows match).
 */
export function buildVisitsByMrnSql(cfg: Record<string, string>): string {
  const tVisit  = cfg['visit.table'];
  const cVisit  = cfg['visit.col.visitId'];
  const cMrn    = cfg['visit.col.mrn'];
  const cDate   = cfg['visit.col.visitDate'];
  const cAdm    = cfg['visit.col.admissionDate'];
  const cDis    = cfg['visit.col.dischargeDate'];
  const cDoc    = cfg['visit.col.doctorCode'];
  const cBed    = cfg['visit.col.bed'];
  const cDiag   = cfg['visit.col.diagnosis'];
  const cStatus = cfg['visit.col.status'];

  const visitTypeExpr  = resolveColumn(cfg, 'visit', 'visitType', 'v', 'lkp_vtype');
  const wardExpr       = resolveColumn(cfg, 'visit', 'ward',      'v', 'lkp_ward');
  const deptCodeExpr   = `v.${cfg['visit.col.deptCode']}`;
  const deptNameExpr   = resolveColumn(cfg, 'visit', 'dept',      'v', 'lkp_dept');
  const doctorNameExpr = resolveColumn(cfg, 'visit', 'doctor',    'v', 'lkp_doc');

  const joins = buildLookupJoins(cfg, [
    ['visit', 'visitType', 'v', 'lkp_vtype'],
    ['visit', 'ward',      'v', 'lkp_ward'],
    ['visit', 'dept',      'v', 'lkp_dept'],
    ['visit', 'doctor',    'v', 'lkp_doc'],
  ]);

  const visitTypeFilterCol = cfg['visit.col.visitType'];
  const typeFilter = `AND (:visitType IS NULL OR v.${visitTypeFilterCol} = :visitType)`;

  return `
    SELECT
      v.${cVisit}   AS "visitId",
      v.${cMrn}     AS "mrn",
      TO_CHAR(v.${cDate}, 'YYYY-MM-DD"T"HH24:MI:SS')  AS "visitDate",
      ${visitTypeExpr}                                  AS "visitType",
      TO_CHAR(v.${cAdm}, 'YYYY-MM-DD"T"HH24:MI:SS')   AS "admissionDate",
      TO_CHAR(v.${cDis}, 'YYYY-MM-DD"T"HH24:MI:SS')   AS "dischargeDate",
      v.${cDoc}     AS "doctorCode",
      ${doctorNameExpr}                                 AS "doctorName",
      ${deptCodeExpr}                                   AS "departmentCode",
      ${deptNameExpr}                                   AS "departmentName",
      ${wardExpr}                                       AS "ward",
      v.${cBed}     AS "bed",
      v.${cDiag}    AS "diagnosis",
      v.${cStatus}  AS "status"
    FROM ${tVisit} v
    ${joins}
    WHERE v.${cMrn} = :mrn
    ${typeFilter}
    ORDER BY v.${cDate} DESC
    FETCH FIRST :lim ROWS ONLY
  `;
}
