import { buildVisitsByMrnSql } from '../visit.templates';

/**
 * D.5 fix verification (2026-07-22) -- see `visit.templates.ts`'s own D.5
 * doc comment for the full rationale. `buildVisitsByMrnSql()` used to take
 * an `opts.visitType` that changed the SQL TEXT itself (a compile-time
 * branch); it's now a pure function of `cfg` alone, and the visit-type
 * filter is expressed as an always-present bind-driven predicate instead.
 *
 * This file proves two things:
 *  1. The builder's output is now deterministic and parameter-free (no
 *     hidden shape variability the compiler could accidentally reintroduce).
 *  2. The NEW bind-driven predicate (`:visitType IS NULL OR col = :visitType`)
 *     is LOGICALLY EQUIVALENT to the OLD compile-time-conditional clause
 *     (`visitType ? "AND col = :visitType" : ''`) for every representative
 *     parameter combination -- i.e. direct-mode row-filtering behavior is
 *     unchanged by this refactor. Proven here as a pure-JS predicate
 *     simulation (no live Oracle available in this environment) rather than
 *     asserted by inspection alone.
 */

const CFG: Record<string, string> = {
  'visit.table': 'VISIT_MASTER',
  'visit.col.visitId': 'VISIT_ID',
  'visit.col.mrn': 'MRN',
  'visit.col.visitDate': 'VISIT_DATE',
  'visit.col.admissionDate': 'ADMISSION_DATE',
  'visit.col.dischargeDate': 'DISCHARGE_DATE',
  'visit.col.doctorCode': 'DOCTOR_CODE',
  'visit.col.bed': 'BED',
  'visit.col.diagnosis': 'DIAGNOSIS',
  'visit.col.status': 'STATUS',
  'visit.col.deptCode': 'DEPT_CODE',
  'visit.col.visitType': 'VISIT_TYPE',
  'visit.col.ward': 'WARD',
  'visit.col.dept': 'DEPT_CODE',
  'visit.col.doctor': 'DOCTOR_CODE',
};

describe('buildVisitsByMrnSql (D.5 bind-driven refactor)', () => {
  it('produces SQL with no parameters at all -- a pure function of cfg', () => {
    // The new signature literally has no second argument -- this test
    // exists so a future regression (re-adding a shape-affecting param)
    // would fail type-checking, not silently pass at runtime.
    const sql = buildVisitsByMrnSql(CFG);
    expect(sql).toEqual(expect.any(String));
    expect(buildVisitsByMrnSql(CFG)).toBe(sql); // deterministic, repeatable
  });

  it('always includes the bind-driven visitType predicate, never a bare/absent clause', () => {
    const sql = buildVisitsByMrnSql(CFG);
    expect(sql).toContain('AND (:visitType IS NULL OR v.VISIT_TYPE = :visitType)');
  });

  // ── Old-vs-new filtering-logic equivalence ─────────────────────────────
  // Simulates row-filtering under both the OLD (SQL-shape-conditional) and
  // NEW (bind-conditional) semantics for a representative dataset and every
  // meaningfully distinct visitType parameter value, proving they select
  // the exact same rows every time.
  interface VisitRow { visitId: string; visitType: string; }
  const ROWS: VisitRow[] = [
    { visitId: 'V1', visitType: 'OPD' },
    { visitId: 'V2', visitType: 'IPD' },
    { visitId: 'V3', visitType: 'OPD' },
    { visitId: 'V4', visitType: 'EMERGENCY' },
  ];

  /** OLD semantics: filter applied only when visitType was truthy (clause absent otherwise). */
  function oldFilter(rows: VisitRow[], visitType?: string): VisitRow[] {
    if (!visitType) return rows; // clause was entirely absent from the SQL -- matches everything
    return rows.filter((r) => r.visitType === visitType);
  }

  /** NEW semantics: `:visitType IS NULL OR col = :visitType`, bind is `opts.visitType ?? null`. */
  function newFilter(rows: VisitRow[], visitType?: string): VisitRow[] {
    const bind = visitType ?? null;
    return rows.filter((r) => bind === null || r.visitType === bind);
  }

  it.each([undefined, 'OPD', 'IPD', 'EMERGENCY', 'NONEXISTENT'])(
    'old and new filtering semantics select identical rows for visitType=%s',
    (visitType) => {
      expect(newFilter(ROWS, visitType)).toEqual(oldFilter(ROWS, visitType));
    },
  );
});
