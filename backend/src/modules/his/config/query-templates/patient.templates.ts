import { resolveColumn, buildLookupJoins } from '../his-config.helpers';

/**
 * patient.templates.ts (D.1, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §4/§9).
 *
 * Pure extraction of `PatientService`'s config-driven SQL builders, with
 * ZERO behavior change -- every function here is byte-identical to the
 * private method / inline closure it replaced, just taking `cfg` (and
 * whatever other arguments the original closure captured) as an explicit
 * parameter instead of `this`/closure state. `PatientService` calls these
 * exact functions today; a future `HisQueryTemplateCompiler` (D.2, not
 * built yet) will call the same functions to compile per-tenant SQL for
 * sync to a Connector -- this file is the single source of truth for
 * "what SQL does patient.getByMrn / patient.search compile to," reused by
 * both paths rather than duplicated.
 */

/** Builds the full patient SELECT (used by `getByMrn`). */
export function buildPatientSelect(cfg: Record<string, string>): { select: string; joins: string } {
  const tPat    = cfg['patient.table'];
  const cMrn    = cfg['patient.col.mrn'];
  const cFN     = cfg['patient.col.firstName'];
  const cMN     = cfg['patient.col.middleName'];
  const cLN     = cfg['patient.col.lastName'];
  const cDob    = cfg['patient.col.dob'];
  const cMob    = cfg['patient.col.mobile'];
  const cEmail  = cfg['patient.col.email'];
  const cAddr   = cfg['patient.col.address'];
  const cCity   = cfg['patient.col.city'];
  const cState  = cfg['patient.col.state'];
  const cPin    = cfg['patient.col.pinCode'];
  const cAadh   = cfg['patient.col.aadhaar'];
  const cReg    = cfg['patient.col.regDate'];
  const cStatus = cfg['patient.col.status'];
  const stAct   = cfg['patient.status.active'];

  const salExpr = resolveColumn(cfg, 'patient', 'salutation', 'p', 'lkp_sal');
  const genExpr = resolveColumn(cfg, 'patient', 'gender',     'p', 'lkp_gen');
  const bgExpr  = resolveColumn(cfg, 'patient', 'bloodGroup', 'p', 'lkp_bg');

  const joins = buildLookupJoins(cfg, [
    ['patient', 'salutation', 'p', 'lkp_sal'],
    ['patient', 'gender',     'p', 'lkp_gen'],
    ['patient', 'bloodGroup', 'p', 'lkp_bg'],
  ]);

  const select = `
    SELECT
      p.${cMrn}    AS "mrn",
      ${salExpr}   AS "salutation",
      p.${cFN}     AS "firstName",
      p.${cMN}     AS "middleName",
      p.${cLN}     AS "lastName",
      TRIM(${salExpr} || ' ' || p.${cFN} || ' ' || NVL(p.${cMN}, '') || ' ' || p.${cLN})
                   AS "fullName",
      ${genExpr}   AS "gender",
      TO_CHAR(p.${cDob}, 'YYYY-MM-DD') AS "dateOfBirth",
      FLOOR(MONTHS_BETWEEN(SYSDATE, p.${cDob}) / 12) AS "age",
      ${bgExpr}    AS "bloodGroup",
      p.${cMob}    AS "mobile",
      p.${cEmail}  AS "email",
      p.${cAddr}   AS "address",
      p.${cCity}   AS "city",
      p.${cState}  AS "state",
      p.${cPin}    AS "pinCode",
      SUBSTR(p.${cAadh}, -4) AS "aadhaarLast4",
      TO_CHAR(p.${cReg}, 'YYYY-MM-DD') AS "registrationDate",
      CASE WHEN p.${cStatus} = '${stAct}' THEN 1 ELSE 0 END AS "isActiveFlag"
    FROM ${tPat} p
    ${joins}
  `;

  return { select, joins };
}

/** Builds the patient search SQL (used by `search()`'s config-driven fallback). */
export function buildPatientSearchSql(cfg: Record<string, string>): string {
  const tPat = cfg['patient.table'];
  const cMrn = cfg['patient.col.mrn'];
  const cFN  = cfg['patient.col.firstName'];
  const cMN  = cfg['patient.col.middleName'];
  const cLN  = cfg['patient.col.lastName'];
  const cMob = cfg['patient.col.mobile'];
  const cDob = cfg['patient.col.dob'];
  const cReg = cfg['patient.col.regDate'];  // may be absent / wrong — handled below

  const genderExpr = resolveColumn(cfg, 'patient', 'gender', 'p', 'lkp_gen');
  const genderJoin = buildLookupJoins(cfg, [['patient', 'gender', 'p', 'lkp_gen']]);

  // Include regDate column + ORDER BY only if the column is actually configured
  const regSelect = cReg
    ? `TO_CHAR(p.${cReg}, 'YYYY-MM-DD') AS "registrationDate"`
    : `NULL AS "registrationDate"`;
  const orderBy   = cReg ? `ORDER BY p.${cReg} DESC` : '';

  return `
    SELECT
      p.${cMrn}   AS "mrn",
      TRIM(p.${cFN} || ' ' || NVL(p.${cMN}, '') || ' ' || p.${cLN}) AS "fullName",
      ${genderExpr}                    AS "gender",
      TO_CHAR(p.${cDob}, 'YYYY-MM-DD') AS "dateOfBirth",
      p.${cMob}                         AS "mobile",
      ${regSelect}
    FROM ${tPat} p
    ${genderJoin}
    WHERE p.${cMrn} = :term
       OR UPPER(p.${cMob}) = :term
       OR UPPER(TRIM(p.${cFN} || ' ' || NVL(p.${cMN}, '') || ' ' || p.${cLN})) LIKE :nameMatch
    ${orderBy}
  `;
}
