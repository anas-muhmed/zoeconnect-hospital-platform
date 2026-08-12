import { resolveColumn, buildLookupJoins } from '../his-config.helpers';

/**
 * reference.templates.ts (D.1, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §4/§9).
 *
 * Pure extraction of `ReferenceService.getDepartments()`/`.getDoctors()`'s
 * inline config-driven SQL builders -- see `patient.templates.ts`'s doc
 * comment for the shared rationale. `ReferenceService.getEmployees()`/
 * `.getUserContext()` are deliberately NOT included here: both use a
 * fixed, hardcoded schema (`EMPLOYEE`, `HISUSER`) rather than
 * `<domain>.table`/`<domain>.col.*` config-driven identifiers, so they
 * don't fit this design's "compiled per-tenant identifier substitution"
 * pattern -- see DYNAMIC_HIS_QUERY_ARCHITECTURE.md §1 for why that
 * distinction matters.
 *
 * D.5 fix (2026-07-22): both builders used to take a compile-time flag
 * (`activeOnly: boolean`, `deptCode?: string`) that changed the SQL TEXT
 * itself (an entire `WHERE`/`AND` clause present or absent). Same class of
 * bug as `visit.templates.ts`'s D.5 fix (see that file's doc comment for
 * the full rationale) -- incompatible with "one queryId = one canonical
 * compiled SQL definition." Both filters are now always-present,
 * bind-value-driven predicates instead: `buildDepartmentsSql` takes an
 * always-bound `:activeOnly` (0/1), `buildDoctorsSql` takes an
 * always-bound `:deptCode` (string or `null`). Neither builder needs the
 * old parameter anymore -- the SQL text is now a pure function of `cfg`
 * alone, and callers supply the filter's actual value as a runtime bind
 * instead of a build-time argument.
 */

export function buildDepartmentsSql(cfg: Record<string, string>): string {
  const tDept   = cfg['department.table'];
  const cCode   = cfg['department.col.code'];
  const cName   = cfg['department.col.name'];
  const cShort  = cfg['department.col.shortCode'];
  const cStatus = cfg['department.col.status'];
  const stAct   = cfg['department.status.active'];

  const typeExpr = resolveColumn(cfg, 'department', 'type', 'd', 'lkp_dtype');
  const joins    = buildLookupJoins(cfg, [['department', 'type', 'd', 'lkp_dtype']]);

  return `
    SELECT
      d.${cCode}   AS "departmentCode",
      d.${cName}   AS "departmentName",
      d.${cShort}  AS "shortCode",
      ${typeExpr}  AS "type",
      CASE WHEN d.${cStatus} = '${stAct}' THEN 1 ELSE 0 END AS "isActiveFlag"
    FROM ${tDept} d
    ${joins}
    WHERE (:activeOnly = 0 OR d.${cStatus} = '${stAct}')
    ORDER BY d.${cName}
  `;
}

export function buildDoctorsSql(cfg: Record<string, string>): string {
  const tDoc    = cfg['doctor.table'];
  const cCode   = cfg['doctor.col.code'];
  const cName   = cfg['doctor.col.name'];
  const cQual   = cfg['doctor.col.qualification'];
  const cDept   = cfg['doctor.col.deptCode'];
  const cStatus = cfg['doctor.col.status'];
  const stAct   = cfg['doctor.status.active'];

  const specExpr     = resolveColumn(cfg, 'doctor', 'specialization', 'doc', 'lkp_spec');
  const deptNameExpr = resolveColumn(cfg, 'doctor', 'dept',           'doc', 'lkp_ddept');

  const joins = buildLookupJoins(cfg, [
    ['doctor', 'specialization', 'doc', 'lkp_spec'],
    ['doctor', 'dept',           'doc', 'lkp_ddept'],
  ]);

  return `
    SELECT
      doc.${cCode}    AS "doctorCode",
      doc.${cName}    AS "doctorName",
      ${specExpr}     AS "specialization",
      doc.${cDept}    AS "departmentCode",
      ${deptNameExpr} AS "departmentName",
      doc.${cQual}    AS "qualification",
      CASE WHEN doc.${cStatus} = '${stAct}' THEN 1 ELSE 0 END AS "isActiveFlag"
    FROM ${tDoc} doc
    ${joins}
    WHERE doc.${cStatus} = '${stAct}'
      AND (:deptCode IS NULL OR doc.${cDept} = :deptCode)
    ORDER BY doc.${cName}
  `;
}
