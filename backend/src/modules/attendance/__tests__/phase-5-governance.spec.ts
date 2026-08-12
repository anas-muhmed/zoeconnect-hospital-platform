/**
 * Phase 5 — Governance unit tests
 *
 * Covers:
 *   AttendanceGovernanceService  — lock creation, unlock, canWrite (EMPLOYEE / ALL / no-lock),
 *                                   isDepartmentLocked, recordSkip, getActiveLocks, getSkipSummary
 *   AttendanceProcessor (Phase 5) — MANUAL_OVERRIDE path, PAYROLL_LOCKED path, normal path
 *   RetroactiveRecalculationService — triggerForEmployee (allowed + blocked),
 *                                     triggerForAll (mixed governance),
 *                                     triggerForDepartment (dept lock blocks entire run)
 */

import { AttendanceGovernanceService, GovernanceDecision } from '../services/attendance-governance.service';
import { RetroactiveRecalculationService } from '../services/retroactive-recalculation.service';
import { AttendanceProcessor } from '../services/attendance-processor.service';
import type { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttendanceConfigService } from '../services/attendance-config.service';

// oracleTenantResolver / attendanceConfig (added to AttendanceGovernanceService's/
// RetroactiveRecalculationService's constructors since this test was last
// updated) -- minimal stand-ins matching the shape each service calls.
function makeOracleTenantResolver(): jest.Mocked<OracleTenantResolver> {
  return {
    resolveForBranch: jest.fn().mockResolvedValue('default-tenant-id'),
  } as unknown as jest.Mocked<OracleTenantResolver>;
}

function makeAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    getRuntimeConfig: jest.fn().mockResolvedValue({
      retroDeptEmpLimit: 500,
      retroBatchLimit: 1000,
    }),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

// ── helpers ────────────────────────────────────────────────────────────────

function makeDate(offset = 0): Date {
  const d = new Date('2026-01-15T00:00:00.000Z');
  d.setDate(d.getDate() + offset);
  return d;
}

function makeLock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lock-uuid-1',
    scope: 'EMPLOYEE',
    employeeCode: 'EMP001',
    departmentCode: null,
    periodFrom: makeDate(-1),
    periodTo: makeDate(1),
    lockedBy: 'payroll-system',
    lockedAt: new Date(),
    reason: 'Payroll exported',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLockRepo(findOneResult: unknown = null, extraMethods: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(findOneResult),
    find:   jest.fn().mockResolvedValue(findOneResult ? [findOneResult] : []),
    count:  jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((v: unknown) => v),
    save:   jest.fn().mockImplementation(async (v: unknown) => ({ ...v as object, id: 'lock-uuid-1' })),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
    ...extraMethods,
  };
}

function makeSkipRepo() {
  return {
    create: jest.fn().mockImplementation((v: unknown) => v),
    save:   jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { reason: 'PAYROLL_LOCKED', count: '3' },
        { reason: 'MANUAL_OVERRIDE', count: '1' },
      ]),
    }),
  };
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), time: jest.fn(() => Date.now()), elapsed: jest.fn(() => 10) };
}

function makeGovernanceService(lockRepo: ReturnType<typeof makeLockRepo>, skipRepo = makeSkipRepo(), logger = makeLogger()) {
  return new AttendanceGovernanceService(lockRepo as any, skipRepo as any, logger as any, makeOracleTenantResolver());
}

// ═══════════════════════════════════════════════════════════════════════════
// AttendanceGovernanceService
// ═══════════════════════════════════════════════════════════════════════════

describe('AttendanceGovernanceService', () => {

  describe('canWrite — EMPLOYEE lock present', () => {
    it('returns not-allowed when EMPLOYEE lock covers the date', async () => {
      const lock = makeLock({ scope: 'EMPLOYEE', employeeCode: 'EMP001' });
      const repo = makeLockRepo(lock);
      // First findOne (EMPLOYEE) returns the lock; second (ALL) won't be reached
      repo.findOne.mockResolvedValueOnce(lock).mockResolvedValueOnce(null);
      const svc = makeGovernanceService(repo);

      const decision = await svc.canWrite('EMP001', makeDate(), 'DEPENDENCY_RECALC');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('PAYROLL_LOCKED');
      expect(decision.lockId).toBe('lock-uuid-1');
    });
  });

  describe('canWrite — ALL lock present', () => {
    it('returns not-allowed when ALL scope lock covers the date', async () => {
      const allLock = makeLock({ scope: 'ALL', employeeCode: null, id: 'all-lock-1' });
      const repo = makeLockRepo();
      // EMPLOYEE check returns null; ALL check returns the lock
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(allLock);
      const svc = makeGovernanceService(repo);

      const decision = await svc.canWrite('EMP999', makeDate(), 'REALTIME');

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('PAYROLL_LOCKED');
      expect(decision.lockId).toBe('all-lock-1');
    });
  });

  describe('canWrite — no lock', () => {
    it('returns allowed when no active lock exists', async () => {
      const repo = makeLockRepo(null);
      repo.findOne.mockResolvedValue(null);
      const svc = makeGovernanceService(repo);

      const decision = await svc.canWrite('EMP001', makeDate(), 'REALTIME');

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBeNull();
      expect(decision.lockId).toBeNull();
    });
  });

  describe('canWrite — DB error defaults to allowed', () => {
    it('returns allowed when lockRepo.findOne throws', async () => {
      const repo = makeLockRepo();
      repo.findOne.mockRejectedValue(new Error('DB down'));
      const svc = makeGovernanceService(repo);

      const decision = await svc.canWrite('EMP001', makeDate(), 'DEPENDENCY_RECALC');

      expect(decision.allowed).toBe(true);
    });
  });

  describe('lockEmployee', () => {
    it('saves lock with scope=EMPLOYEE and returns saved entity', async () => {
      const repo = makeLockRepo();
      const svc = makeGovernanceService(repo);

      const lock = await svc.lockEmployee({
        employeeCode: 'EMP001',
        periodFrom: makeDate(-3),
        periodTo: makeDate(0),
        lockedBy: 'hr-admin',
        reason: 'Salary processed',
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'EMPLOYEE', employeeCode: 'EMP001', isActive: true }));
      expect(repo.save).toHaveBeenCalled();
      expect(lock.id).toBe('lock-uuid-1');
    });
  });

  describe('lockAll', () => {
    it('saves lock with scope=ALL, null codes', async () => {
      const repo = makeLockRepo();
      const svc = makeGovernanceService(repo);

      await svc.lockAll({ periodFrom: makeDate(-1), periodTo: makeDate(0), lockedBy: 'payroll-batch' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'ALL',
        employeeCode: null,
        departmentCode: null,
      }));
    });
  });

  describe('unlock', () => {
    it('calls repo.update with isActive=false', async () => {
      const repo = makeLockRepo();
      const svc = makeGovernanceService(repo);

      await svc.unlock('lock-uuid-1', 'admin-user');

      expect(repo.update).toHaveBeenCalledWith({ id: 'lock-uuid-1' }, { isActive: false });
    });
  });

  describe('isDepartmentLocked', () => {
    it('returns lock when DEPARTMENT scope matches', async () => {
      const deptLock = makeLock({ scope: 'DEPARTMENT', departmentCode: 'CARDIO', employeeCode: null });
      const repo = makeLockRepo(deptLock);
      const svc = makeGovernanceService(repo);

      const result = await svc.isDepartmentLocked('CARDIO', makeDate());

      expect(result).not.toBeNull();
      expect(result?.scope).toBe('DEPARTMENT');
    });

    it('returns null when no DEPARTMENT lock exists', async () => {
      const repo = makeLockRepo(null);
      const svc = makeGovernanceService(repo);

      const result = await svc.isDepartmentLocked('ICU', makeDate());

      expect(result).toBeNull();
    });
  });

  describe('recordSkip', () => {
    it('creates and saves a skip log entry', async () => {
      const skipRepo = makeSkipRepo();
      const svc = makeGovernanceService(makeLockRepo(), skipRepo);

      await svc.recordSkip({
        employeeCode: 'EMP001',
        dutyDate: makeDate(),
        skipReason: 'PAYROLL_LOCKED',
        mode: 'DEPENDENCY_RECALC',
        attendanceEventId: 'evt-uuid',
        metadata: { lockId: 'lock-uuid-1' },
      });

      expect(skipRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        employeeCode: 'EMP001',
        skipReason: 'PAYROLL_LOCKED',
        mode: 'DEPENDENCY_RECALC',
        attendanceEventId: 'evt-uuid',
      }));
      expect(skipRepo.save).toHaveBeenCalled();
    });

    it('does not throw when skipRepo.save fails', async () => {
      const skipRepo = makeSkipRepo();
      (skipRepo.save as jest.Mock).mockRejectedValue(new Error('disk full'));
      const svc = makeGovernanceService(makeLockRepo(), skipRepo);

      await expect(svc.recordSkip({
        employeeCode: 'EMP001',
        dutyDate: makeDate(),
        skipReason: 'MANUAL_OVERRIDE',
        mode: 'REALTIME',
      })).resolves.not.toThrow();
    });
  });

  describe('getActiveLocks', () => {
    it('returns all active locks', async () => {
      const repo = makeLockRepo(makeLock());
      const svc = makeGovernanceService(repo);

      const locks = await svc.getActiveLocks();

      expect(locks.length).toBeGreaterThan(0);
    });
  });

  describe('getSkipSummary', () => {
    it('returns skip counts by reason for the given window', async () => {
      const svc = makeGovernanceService(makeLockRepo(), makeSkipRepo());

      const summary = await svc.getSkipSummary(new Date(Date.now() - 24 * 60 * 60_000));

      expect(summary['PAYROLL_LOCKED']).toBe(3);
      expect(summary['MANUAL_OVERRIDE']).toBe(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AttendanceProcessor — governance integration
// ═══════════════════════════════════════════════════════════════════════════

describe('AttendanceProcessor — Phase 5 governance gate', () => {
  function makeEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: 'evt-1',
      sourceId: 'SRC-001',
      employeeCode: 'EMP001',
      logDateTime: makeDate(),
      direction: 'IN',
      status: 'QUEUED',
      attemptCount: 0,
      lastError: null,
      decisionStatus: null,
      processedAt: null,
      rawPayload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function makeRoster(overrides: Record<string, unknown> = {}) {
    return {
      employeeCode: 'EMP001',
      employeeId: 101,
      dutyDate: makeDate(),
      shiftCode: 'DAY',
      rosterId: null,
      primaryShiftId: 1,
      secondShiftId: null,
      plannedIn: null,
      plannedOut: null,
      secondPlannedIn: null,
      secondPlannedOut: null,
      plannedStatus: null,
      actualStatus: null,
      approvedLeaveType: null,
      approvedLeaveDayPart: null,
      isHoliday: false,
      isWeekOff: false,
      isResigned: false,
      isNight: false,
      isWorkShift: true,
      intraBranchId: null,
      raw: {},
      ...overrides,
    };
  }

  function makeDecision(overrides: Record<string, unknown> = {}) {
    return {
      status: 'PRESENT',
      inPunch: makeDate(),
      outPunch: makeDate(),
      lateMinutes: 0,
      earlyGoingMinutes: 0,
      workMinutes: 480,
      reasonCode: 'PRESENT',
      reason: 'Present.',
      confidence: 'HIGH',
      requiresManualReview: false,
      actualShiftCode: 'DAY',
      ruleSnapshot: {},
      punchCount: 2,
      ...overrides,
    };
  }

  function makeProcessor(
    event: ReturnType<typeof makeEvent>,
    roster: ReturnType<typeof makeRoster>,
    decision: ReturnType<typeof makeDecision>,
    oldValue: Record<string, unknown> | null,
    govDecision: GovernanceDecision,
  ) {
    const eventRepo = {
      findOne: jest.fn().mockResolvedValue(event),
      save:    jest.fn().mockImplementation(async (e: unknown) => e),
    };
    const rosterResolver   = { resolve: jest.fn().mockResolvedValue(roster) };
    const ruleEngine       = { getRulesFor: jest.fn().mockResolvedValue({}), getEvaluationWindow: jest.fn().mockReturnValue({ from: makeDate(-1), to: makeDate(1) }) };
    const punchHistory     = { getSourcePunchesForWindow: jest.fn().mockResolvedValue([]) };
    const decisionEngine   = { evaluate: jest.fn().mockReturnValue(decision) };
    const actualUpdater    = { getCurrentActual: jest.fn().mockResolvedValue(oldValue), upsert: jest.fn().mockResolvedValue({}) };
    const auditService     = { record: jest.fn().mockResolvedValue(undefined) };
    const logger           = makeLogger();
    const snapshotService  = { capture: jest.fn().mockResolvedValue(undefined) };
    const governanceService = {
      canWrite:    jest.fn().mockResolvedValue(govDecision),
      recordSkip:  jest.fn().mockResolvedValue(undefined),
    };

    const processor = new AttendanceProcessor(
      eventRepo as any,
      rosterResolver as any,
      ruleEngine as any,
      punchHistory as any,
      decisionEngine as any,
      actualUpdater as any,
      auditService as any,
      logger as any,
      snapshotService as any,
      governanceService as any,
    );

    return { processor, eventRepo, actualUpdater, auditService, governanceService, snapshotService };
  }

  it('calls actualUpdater.upsert when governance allows', async () => {
    const event    = makeEvent();
    const roster   = makeRoster();
    const decision = makeDecision();
    const { processor, actualUpdater } = makeProcessor(event, roster, decision, null, { allowed: true, reason: null, lockId: null });

    await processor.processEvent('evt-1', 'REALTIME');

    expect(actualUpdater.upsert).toHaveBeenCalled();
  });

  it('skips write and records skip log when PAYROLL_LOCKED', async () => {
    const event    = makeEvent();
    const roster   = makeRoster();
    const decision = makeDecision();
    const govDecision: GovernanceDecision = { allowed: false, reason: 'PAYROLL_LOCKED', lockId: 'lock-1' };
    const { processor, actualUpdater, governanceService, eventRepo } = makeProcessor(event, roster, decision, null, govDecision);

    await processor.processEvent('evt-1', 'DEPENDENCY_RECALC');

    expect(actualUpdater.upsert).not.toHaveBeenCalled();
    expect(governanceService.recordSkip).toHaveBeenCalledWith(expect.objectContaining({ skipReason: 'PAYROLL_LOCKED' }));
    expect(eventRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SKIPPED' }));
  });

  it('skips write and records MANUAL_OVERRIDE when remarks do not start with ZoeConnect realtime:', async () => {
    const event    = makeEvent();
    const roster   = makeRoster();
    const decision = makeDecision();
    const oldValue = { REMARKS: 'HR manual correction' };
    const { processor, actualUpdater, governanceService } = makeProcessor(
      event, roster, decision, oldValue,
      { allowed: true, reason: null, lockId: null },
    );

    await processor.processEvent('evt-1', 'REALTIME');

    expect(actualUpdater.upsert).not.toHaveBeenCalled();
    expect(governanceService.recordSkip).toHaveBeenCalledWith(expect.objectContaining({ skipReason: 'MANUAL_OVERRIDE' }));
  });

  it('does NOT skip when REMARKS starts with "ZoeConnect realtime:"', async () => {
    const event    = makeEvent();
    const roster   = makeRoster();
    const decision = makeDecision();
    const oldValue = { REMARKS: 'ZoeConnect realtime: auto-computed' };
    const { processor, actualUpdater } = makeProcessor(event, roster, decision, oldValue, { allowed: true, reason: null, lockId: null });

    await processor.processEvent('evt-1', 'REALTIME');

    expect(actualUpdater.upsert).toHaveBeenCalled();
  });

  it('never calls actualUpdater.upsert for an INELIGIBLE decision (employee not considered for punch tracking)', async () => {
    // Regression test: an employee failing the eligibility gate
    // (EMPLOYEE.ISPUNCHREQUIRED=0, inactive, relieved, or no active
    // EMPLOYEESCMAPFORDUTYROSTER mapping) must never get a DUTYACTUALVALUES
    // row written — not even a placeholder — and must not go through the
    // governance gate at all.
    const event    = makeEvent();
    const roster   = makeRoster({ isEligibleForPunch: false, ineligibleReason: 'Employee has no currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER mapping.' });
    const decision = makeDecision({
      status: 'INELIGIBLE',
      reasonCode: 'PUNCH_NOT_APPLICABLE',
      reason: 'Employee has no currently-ACTIVE EMPLOYEESCMAPFORDUTYROSTER mapping.',
    });
    const { processor, actualUpdater, governanceService, eventRepo } = makeProcessor(
      event, roster, decision, null,
      { allowed: true, reason: null, lockId: null },
    );

    await processor.processEvent('evt-1', 'REALTIME');

    expect(actualUpdater.upsert).not.toHaveBeenCalled();
    expect(governanceService.canWrite).not.toHaveBeenCalled();
    expect(eventRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SKIPPED', decisionStatus: 'INELIGIBLE' }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RetroactiveRecalculationService
// ═══════════════════════════════════════════════════════════════════════════

describe('RetroactiveRecalculationService', () => {
  function makeAttendanceEvent(employeeCode: string, daysOffset = 0) {
    return {
      id: `evt-${employeeCode}-${daysOffset}`,
      employeeCode,
      logDateTime: makeDate(daysOffset),
      status: 'PROCESSED',
    };
  }

  function makeService(
    events: ReturnType<typeof makeAttendanceEvent>[],
    govDecisions: Map<string, GovernanceDecision>,
    oracleEmployees: string[] = [],
  ) {
    const eventRepo = {
      find: jest.fn().mockResolvedValue(events),
    };
    const queueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const governanceService = {
      canWrite: jest.fn().mockImplementation(async (code: string) => {
        return govDecisions.get(code) ?? { allowed: true, reason: null, lockId: null };
      }),
      isDepartmentLocked: jest.fn().mockResolvedValue(null),
      recordSkip: jest.fn().mockResolvedValue(undefined),
    };
    const logger = makeLogger();
    const oracle = {
      query: jest.fn().mockResolvedValue(oracleEmployees.map(c => ({ EMPNO: c }))),
    };

    const svc = new RetroactiveRecalculationService(
      eventRepo as any,
      queueService as any,
      governanceService as any,
      logger as any,
      makeAttendanceConfig(),
      oracle as any,
    );

    return { svc, eventRepo, queueService, governanceService };
  }

  it('triggerForEmployee enqueues events that pass governance', async () => {
    const events = [makeAttendanceEvent('EMP001', 0), makeAttendanceEvent('EMP001', 1)];
    const govMap = new Map([['EMP001', { allowed: true, reason: null, lockId: null }]]);
    const { svc, queueService } = makeService(events, govMap);

    const result = await svc.triggerForEmployee('EMP001', makeDate(-1), makeDate(1));

    expect(queueService.enqueue).toHaveBeenCalledTimes(2);
    expect(result.eventsEnqueued).toBe(2);
    expect(result.eventsSkipped).toBe(0);
  });

  it('triggerForEmployee skips events blocked by governance', async () => {
    const events = [makeAttendanceEvent('EMP001', 0)];
    const govMap = new Map([['EMP001', { allowed: false, reason: 'PAYROLL_LOCKED' as const, lockId: 'lk-1' }]]);
    const { svc, queueService, governanceService } = makeService(events, govMap);

    const result = await svc.triggerForEmployee('EMP001', makeDate(-1), makeDate(1));

    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(result.eventsSkipped).toBe(1);
    expect(governanceService.recordSkip).toHaveBeenCalled();
  });

  it('triggerForAll deduplicates events with same (employeeCode, date)', async () => {
    // Two events for EMP001 on same date → deduplicated to 1
    const d = makeDate();
    const events = [
      { id: 'e1', employeeCode: 'EMP001', logDateTime: d, status: 'PROCESSED' },
      { id: 'e2', employeeCode: 'EMP001', logDateTime: new Date(d.getTime() + 3600_000), status: 'PROCESSED' },
    ];
    const { svc, queueService } = makeService(events as any, new Map());

    const result = await svc.triggerForAll(makeDate(-1), makeDate(1));

    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(result.eventsEnqueued).toBe(1);
  });

  it('triggerForAll reports eventsSkipped for governed employees', async () => {
    const events = [makeAttendanceEvent('EMPX', 0), makeAttendanceEvent('EMPY', 0)];
    const govMap = new Map<string, GovernanceDecision>([
      ['EMPX', { allowed: false, reason: 'PAYROLL_LOCKED', lockId: 'lk-2' }],
      ['EMPY', { allowed: true,  reason: null,             lockId: null }],
    ]);
    const { svc, queueService } = makeService(events, govMap);

    const result = await svc.triggerForAll(makeDate(-1), makeDate(1));

    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(result.eventsEnqueued).toBe(1);
    expect(result.eventsSkipped).toBe(1);
  });

  it('triggerForDepartment returns empty result when DEPARTMENT lock exists', async () => {
    const events = [makeAttendanceEvent('EMP001', 0)];
    const { svc, queueService, governanceService } = makeService(events, new Map(), ['EMP001']);
    (governanceService.isDepartmentLocked as jest.Mock).mockResolvedValue(makeLock({ scope: 'DEPARTMENT', departmentCode: 'ICU' }));

    const result = await svc.triggerForDepartment('ICU', makeDate(-1), makeDate(1));

    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(result.eventsEnqueued).toBe(0);
  });

  it('triggerForDepartment fetches employees from Oracle and enqueues their events', async () => {
    const events = [makeAttendanceEvent('EMP100', 0)];
    const { svc, queueService } = makeService(events, new Map(), ['EMP100']);

    const result = await svc.triggerForDepartment('CARDIO', makeDate(-1), makeDate(1));

    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(result.eventsEnqueued).toBe(1);
  });
});
