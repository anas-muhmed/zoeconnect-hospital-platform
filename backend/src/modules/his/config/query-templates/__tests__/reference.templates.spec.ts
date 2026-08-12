import { buildDepartmentsSql, buildDoctorsSql } from '../reference.templates';

/**
 * D.5 fix verification (2026-07-22) -- see `reference.templates.ts`'s own
 * D.5 doc comment. `buildDepartmentsSql(cfg, activeOnly)` and
 * `buildDoctorsSql(cfg, deptCode)` used to take a compile-time argument
 * that changed the SQL TEXT itself; both are now pure functions of `cfg`
 * alone, with the filter expressed as an always-present bind-driven
 * predicate. Same verification shape as `visit.templates.spec.ts`: (1)
 * determinism/parameter-freedom, (2) old-vs-new filtering-logic
 * equivalence via a pure-JS predicate simulation (no live Oracle available
 * in this environment).
 */

const DEPT_CFG: Record<string, string> = {
  'department.table': 'DEPT_MASTER',
  'department.col.code': 'DEPT_CODE',
  'department.col.name': 'DEPT_NAME',
  'department.col.shortCode': 'SHORT_CODE',
  'department.col.status': 'STATUS',
  'department.status.active': 'A',
  'department.col.type': 'DEPT_TYPE',
};

const DOCTOR_CFG: Record<string, string> = {
  'doctor.table': 'DOCTOR_MASTER',
  'doctor.col.code': 'DOC_CODE',
  'doctor.col.name': 'DOC_NAME',
  'doctor.col.qualification': 'QUALIFICATION',
  'doctor.col.deptCode': 'DEPT_CODE',
  'doctor.col.status': 'STATUS',
  'doctor.status.active': 'A',
  'doctor.col.specialization': 'SPECIALIZATION',
  'doctor.col.dept': 'DEPT_CODE',
};

describe('buildDepartmentsSql (D.5 bind-driven refactor)', () => {
  it('produces SQL with no parameters at all -- a pure function of cfg', () => {
    const sql = buildDepartmentsSql(DEPT_CFG);
    expect(buildDepartmentsSql(DEPT_CFG)).toBe(sql); // deterministic, repeatable
  });

  it('always includes the bind-driven activeOnly predicate, never a bare/absent clause', () => {
    const sql = buildDepartmentsSql(DEPT_CFG);
    expect(sql).toContain("WHERE (:activeOnly = 0 OR d.STATUS = 'A')");
  });

  interface DeptRow { code: string; status: 'A' | 'I'; }
  const ROWS: DeptRow[] = [
    { code: 'CARD', status: 'A' },
    { code: 'ORTHO', status: 'A' },
    { code: 'ARCHIVED_DEPT', status: 'I' },
  ];

  /** OLD semantics: WHERE clause present only when activeOnly was true. */
  function oldFilter(rows: DeptRow[], activeOnly: boolean): DeptRow[] {
    if (!activeOnly) return rows; // clause was entirely absent -- matches everything
    return rows.filter((r) => r.status === 'A');
  }

  /** NEW semantics: `(:activeOnly = 0 OR status = 'A')`, bind is `activeOnly ? 1 : 0`. */
  function newFilter(rows: DeptRow[], activeOnly: boolean): DeptRow[] {
    const bind = activeOnly ? 1 : 0;
    return rows.filter((r) => bind === 0 || r.status === 'A');
  }

  it.each([true, false])(
    'old and new filtering semantics select identical rows for activeOnly=%s',
    (activeOnly) => {
      expect(newFilter(ROWS, activeOnly)).toEqual(oldFilter(ROWS, activeOnly));
    },
  );
});

describe('buildDoctorsSql (D.5 bind-driven refactor)', () => {
  it('produces SQL with no parameters at all -- a pure function of cfg', () => {
    const sql = buildDoctorsSql(DOCTOR_CFG);
    expect(buildDoctorsSql(DOCTOR_CFG)).toBe(sql); // deterministic, repeatable
  });

  it('always includes the bind-driven deptCode predicate, never a bare/absent clause', () => {
    const sql = buildDoctorsSql(DOCTOR_CFG);
    expect(sql).toContain('AND (:deptCode IS NULL OR doc.DEPT_CODE = :deptCode)');
    // The unconditional active-status filter is untouched by this refactor.
    expect(sql).toContain("WHERE doc.STATUS = 'A'");
  });

  interface DoctorRow { code: string; deptCode: string; }
  const ROWS: DoctorRow[] = [
    { code: 'D1', deptCode: 'CARD' },
    { code: 'D2', deptCode: 'ORTHO' },
    { code: 'D3', deptCode: 'CARD' },
  ];

  /** OLD semantics: AND clause present only when deptCode was truthy. */
  function oldFilter(rows: DoctorRow[], deptCode?: string): DoctorRow[] {
    if (!deptCode) return rows; // clause was entirely absent -- matches everything
    return rows.filter((r) => r.deptCode === deptCode);
  }

  /** NEW semantics: `:deptCode IS NULL OR col = :deptCode`, bind is `deptCode ?? null`. */
  function newFilter(rows: DoctorRow[], deptCode?: string): DoctorRow[] {
    const bind = deptCode ?? null;
    return rows.filter((r) => bind === null || r.deptCode === bind);
  }

  it.each([undefined, 'CARD', 'ORTHO', 'NONEXISTENT'])(
    'old and new filtering semantics select identical rows for deptCode=%s',
    (deptCode) => {
      expect(newFilter(ROWS, deptCode)).toEqual(oldFilter(ROWS, deptCode));
    },
  );
});
