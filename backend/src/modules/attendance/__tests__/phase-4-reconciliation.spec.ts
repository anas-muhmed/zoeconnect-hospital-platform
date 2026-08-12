/**
 * Phase 4 — HIS Reconciliation unit tests
 *
 * Coverage:
 *   DependencySnapshotService
 *     • capture() upserts via QueryBuilder insert + orUpdate
 *     • capture() swallows errors — never throws
 *     • findForDate() delegates to QueryBuilder with dayBounds
 *
 *   HisDivergenceService
 *     • HIS_CONFIRMED when hdspDecision === hisAttendance
 *     • HIS_DIVERGED when they differ
 *     • HDSP_ONLY when hisAttendance is null
 *     • HIS_ONLY when hdspDecision is null
 *     • both null → HIS_CONFIRMED (both absent)
 *     • ACCEPT_HIS: calls snapshotRepo update on divergence
 *     • ACCEPT_HDSP: does NOT call snapshotRepo update
 *     • ALERT_ONLY: does NOT call snapshotRepo update
 *     • always writes a divergence log row
 *
 *   HisReconciliationJob
 *     • returns emptySummary when HIS_RECON_ENABLED=false
 *     • calls oracle.query with correct SQL substitutions
 *     • counts confirmed + diverged correctly from real pairs
 *     • counts hdspOnly for snapshots with no HIS counterpart
 *     • catches per-row errors and increments summary.errors
 *     • logs completion metadata
 */

import { DependencySnapshotService } from '../services/dependency-snapshot.service';
import { HisDivergenceService } from '../services/his-divergence.service';
import { HisReconciliationJob } from '../services/his-reconciliation.job';
import { AttendanceDependencySnapshot } from '../entities/attendance-dependency-snapshot.entity';
import { AttendanceDivergenceLog } from '../entities/attendance-divergence-log.entity';
import { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { LicenseService } from '../../licensing/license.service';
import type { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

// oracleTenantResolver / attendanceConfig (added to DependencySnapshotService /
// HisDivergenceService's constructors since this test was last updated) --
// minimal stand-ins matching the shape each service actually calls.
function makeOracleTenantResolver(): jest.Mocked<OracleTenantResolver> {
  return {
    resolveForBranch: jest.fn().mockResolvedValue('default-tenant-id'),
  } as unknown as jest.Mocked<OracleTenantResolver>;
}

function makeAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    // Reads process.env at CALL time (not once at mock-creation time) --
    // this test file directly sets/deletes ATTENDANCE_RECON_STRATEGY per
    // case to drive HisDivergenceService.compare()'s strategy branch,
    // mirroring how the real AttendanceConfigService falls back to that
    // env var absent a DB-stored override.
    getRuntimeConfig: jest.fn().mockImplementation(async () => ({
      reconStrategy: process.env['ATTENDANCE_RECON_STRATEGY'] ?? 'ACCEPT_HIS',
    })),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

// ATTENDANCE is licensed by default in these tests -- reconcileYesterday()'s
// license gate (see his-reconciliation.job.ts) would otherwise short-circuit
// before any of the reconcileDate() logic under test ever runs.
function makeLicenseService(licensed = true) {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(licensed),
  } as unknown as jest.Mocked<LicenseService>;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeLogger(): jest.Mocked<AttendanceStructuredLogger> {
  return {
    info:    jest.fn(),
    warn:    jest.fn(),
    error:   jest.fn(),
    time:    jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 5),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

function makeSnapshot(employeeCode: string, hdspDecision = 'PRESENT'): AttendanceDependencySnapshot {
  return {
    id:             randomUUID(),
    employeeCode,
    dutyDate:       new Date('2025-06-15'),
    hdspDecision:   hdspDecision as any,
    shiftCode:      'DAY',
    processingMode: 'REALTIME',
    capturedAt:     new Date(),
    createdAt:      new Date(),
    updatedAt:      new Date(),
  } as AttendanceDependencySnapshot;
}

// ── DependencySnapshotService ──────────────────────────────────────────────────

describe('DependencySnapshotService', () => {
  let snapshotRepo: jest.Mocked<Repository<AttendanceDependencySnapshot>>;
  let logger: jest.Mocked<AttendanceStructuredLogger>;
  let svc: DependencySnapshotService;

  const qb = {
    insert:      jest.fn().mockReturnThis(),
    into:        jest.fn().mockReturnThis(),
    values:      jest.fn().mockReturnThis(),
    orUpdate:    jest.fn().mockReturnThis(),
    execute:     jest.fn(async () => {}),
    update:      jest.fn().mockReturnThis(),
    set:         jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    andWhere:    jest.fn().mockReturnThis(),
    getMany:     jest.fn(async () => []),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotRepo = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as jest.Mocked<Repository<AttendanceDependencySnapshot>>;
    logger = makeLogger();
    svc = new DependencySnapshotService(snapshotRepo as any, logger, makeOracleTenantResolver());
  });

  it('capture() calls insert → into → values → orUpdate → execute', async () => {
    await svc.capture({
      employeeCode: 'EMP001',
      dutyDate:     new Date('2025-06-15'),
      hdspDecision: 'PRESENT',
      shiftCode:    'DAY',
      mode:         'REALTIME',
    });

    expect(qb.insert).toHaveBeenCalled();
    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({ employeeCode: 'EMP001' }));
    expect(qb.orUpdate).toHaveBeenCalled();
    expect(qb.execute).toHaveBeenCalled();
  });

  it('capture() swallows errors and logs a warning — never throws', async () => {
    qb.execute.mockRejectedValueOnce(new Error('DB gone'));
    await expect(
      svc.capture({ employeeCode: 'E1', dutyDate: new Date(), hdspDecision: 'LEAVE', shiftCode: null, mode: 'REALTIME' }),
    ).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('findForDate() queries with dayBounds', async () => {
    await svc.findForDate(new Date('2025-06-15'));
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('dutyDate'),
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
    );
    expect(qb.getMany).toHaveBeenCalled();
  });
});

// ── HisDivergenceService ───────────────────────────────────────────────────────

describe('HisDivergenceService', () => {
  let logRepo: jest.Mocked<Repository<AttendanceDivergenceLog>>;
  let snapshotRepo: jest.Mocked<Repository<AttendanceDependencySnapshot>>;
  let logger: jest.Mocked<AttendanceStructuredLogger>;
  let svc: HisDivergenceService;

  const updateQb = {
    update:  jest.fn().mockReturnThis(),
    set:     jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    execute: jest.fn(async () => {}),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['ATTENDANCE_RECON_STRATEGY'];

    logRepo = {
      create: jest.fn((d) => d),
      save:   jest.fn(async (d) => d),
    } as unknown as jest.Mocked<Repository<AttendanceDivergenceLog>>;

    snapshotRepo = {
      createQueryBuilder: jest.fn(() => updateQb),
    } as unknown as jest.Mocked<Repository<AttendanceDependencySnapshot>>;

    logger = makeLogger();
    svc = new HisDivergenceService(logRepo as any, snapshotRepo as any, logger, makeAttendanceConfig());
  });

  const makeInput = (hdspDecision: string | null, hisAttendance: string | null) => ({
    employeeCode:  'EMP001',
    dutyDate:      new Date('2025-06-15'),
    hdspDecision,
    hisAttendance,
    reconciledAt:  new Date(),
  });

  it('returns HIS_CONFIRMED when both values match', async () => {
    const { outcome } = await svc.compare(makeInput('PRESENT', 'PRESENT'));
    expect(outcome).toBe('HIS_CONFIRMED');
  });

  it('returns HIS_DIVERGED when values differ', async () => {
    const { outcome } = await svc.compare(makeInput('PRESENT', 'ABSENT'));
    expect(outcome).toBe('HIS_DIVERGED');
  });

  it('returns HDSP_ONLY when hisAttendance is null', async () => {
    const { outcome } = await svc.compare(makeInput('PRESENT', null));
    expect(outcome).toBe('HDSP_ONLY');
  });

  it('returns HIS_ONLY when hdspDecision is null', async () => {
    const { outcome } = await svc.compare(makeInput(null, 'ABSENT'));
    expect(outcome).toBe('HIS_ONLY');
  });

  it('returns HIS_CONFIRMED when both are null', async () => {
    const { outcome } = await svc.compare(makeInput(null, null));
    expect(outcome).toBe('HIS_CONFIRMED');
  });

  it('always saves a divergence log row', async () => {
    await svc.compare(makeInput('PRESENT', 'PRESENT'));
    expect(logRepo.save).toHaveBeenCalledTimes(1);
  });

  it('ACCEPT_HIS (default): updates snapshot on divergence', async () => {
    await svc.compare(makeInput('PRESENT', 'ABSENT'));
    expect(updateQb.update).toHaveBeenCalled();
    expect(updateQb.set).toHaveBeenCalledWith(expect.objectContaining({ hdspDecision: 'ABSENT' }));
    expect(updateQb.execute).toHaveBeenCalled();
  });

  it('ACCEPT_HDSP: does NOT update snapshot on divergence', async () => {
    process.env['ATTENDANCE_RECON_STRATEGY'] = 'ACCEPT_HDSP';
    await svc.compare(makeInput('PRESENT', 'ABSENT'));
    expect(updateQb.execute).not.toHaveBeenCalled();
  });

  it('ALERT_ONLY: does NOT update snapshot on divergence', async () => {
    process.env['ATTENDANCE_RECON_STRATEGY'] = 'ALERT_ONLY';
    await svc.compare(makeInput('PRESENT', 'ABSENT'));
    expect(updateQb.execute).not.toHaveBeenCalled();
  });

  it('logs a warning for HIS_DIVERGED', async () => {
    await svc.compare(makeInput('PRESENT', 'ABSENT'));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('divergence'),
      expect.objectContaining({ processingStage: 'HIS_DIVERGENCE' }),
    );
  });

  it('strategyApplied is null for HIS_CONFIRMED', async () => {
    const { strategyApplied } = await svc.compare(makeInput('ON_LEAVE', 'ON_LEAVE'));
    expect(strategyApplied).toBeNull();
  });
});

// ── HisReconciliationJob ───────────────────────────────────────────────────────

describe('HisReconciliationJob', () => {
  let oracle: { query: jest.MockedFunction<any> };
  let snapshotSvc: jest.Mocked<DependencySnapshotService>;
  let divergenceSvc: jest.Mocked<HisDivergenceService>;
  let logger: jest.Mocked<AttendanceStructuredLogger>;
  let config: { getConfig: jest.MockedFunction<any>; ident: jest.MockedFunction<any> };
  let job: HisReconciliationJob;

  const DUTY_DATE = new Date('2025-06-15T00:00:00.000Z');

  beforeEach(() => {
    delete process.env['HIS_RECON_ENABLED'];
    delete process.env['HIS_RECON_BATCH_SIZE'];

    oracle = { query: jest.fn(async () => []) };

    snapshotSvc = {
      findForDate: jest.fn(async () => []),
      capture:     jest.fn(async () => {}),
    } as unknown as jest.Mocked<DependencySnapshotService>;

    divergenceSvc = {
      compare: jest.fn(async ({ hdspDecision, hisAttendance }) => ({
        outcome: hdspDecision === hisAttendance ? 'HIS_CONFIRMED' : 'HIS_DIVERGED',
        strategyApplied: hdspDecision === hisAttendance ? null : 'ACCEPT_HIS',
      })),
    } as unknown as jest.Mocked<HisDivergenceService>;

    logger = makeLogger();

    config = {
      getConfig: jest.fn(async () => ({
        'attendance.actual.table':      'DUTYACTUALVALUES',
        'attendance.employee.table':    'EMPLOYEE',
        'attendance.actual.employeeId': 'EMPID',
        'attendance.employee.id':       'EMPLOYEE_ID',
        'attendance.employee.code':     'EMPNO',
        'attendance.actual.dutyDate':   'ACTUALDATE',
        'attendance.actual.status':     'ATTENDANCE',
      })),
      ident: jest.fn((cfg: Record<string, string>, key: string) => cfg[key] ?? key),
    };

    job = new HisReconciliationJob(
      oracle as any,
      config as any,
      snapshotSvc,
      divergenceSvc,
      logger,
      makeLicenseService(),
    );
  });

  it('returns emptySummary when HIS_RECON_ENABLED=false', async () => {
    process.env['HIS_RECON_ENABLED'] = 'false';
    const summary = await job.reconcileDate(DUTY_DATE);
    expect(summary.hisRows).toBe(0);
    expect(oracle.query).not.toHaveBeenCalled();
  });

  it('calls oracle.query with DUTYACTUALVALUES join', async () => {
    await job.reconcileDate(DUTY_DATE);
    expect(oracle.query).toHaveBeenCalledWith(
      expect.stringContaining('DUTYACTUALVALUES'),
      expect.objectContaining({ dateStr: '2025-06-15' }),
    );
  });

  it('counts confirmed and diverged from Oracle rows + snapshots', async () => {
    oracle.query.mockResolvedValue([
      { employeeCode: 'EMP001', attendance: 'PRESENT' },
      { employeeCode: 'EMP002', attendance: 'ABSENT' },
    ]);
    snapshotSvc.findForDate.mockResolvedValue([
      makeSnapshot('EMP001', 'PRESENT'),  // matches → confirmed
      makeSnapshot('EMP002', 'PRESENT'),  // differs → diverged
    ]);

    const summary = await job.reconcileDate(DUTY_DATE);
    expect(summary.hisRows).toBe(2);
    expect(summary.hdspSnapshots).toBe(2);
    expect(summary.confirmed).toBe(1);
    expect(summary.diverged).toBe(1);
  });

  it('counts hdspOnly for snapshots with no HIS counterpart', async () => {
    oracle.query.mockResolvedValue([]);  // no HIS rows
    snapshotSvc.findForDate.mockResolvedValue([
      makeSnapshot('EMP001', 'PRESENT'),
    ]);

    const summary = await job.reconcileDate(DUTY_DATE);
    expect(summary.hdspOnly).toBe(1);
    expect(divergenceSvc.compare).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: 'EMP001', hisAttendance: null }),
    );
  });

  it('counts hisOnly when HIS has row but no snapshot exists', async () => {
    oracle.query.mockResolvedValue([
      { employeeCode: 'EMP_NEW', attendance: 'PRESENT' },
    ]);
    snapshotSvc.findForDate.mockResolvedValue([]);
    divergenceSvc.compare.mockResolvedValue({ outcome: 'HIS_ONLY', strategyApplied: null });

    const summary = await job.reconcileDate(DUTY_DATE);
    expect(summary.hisOnly).toBe(1);
  });

  it('catches per-row errors and increments summary.errors', async () => {
    oracle.query.mockResolvedValue([
      { employeeCode: 'EMP001', attendance: 'PRESENT' },
    ]);
    snapshotSvc.findForDate.mockResolvedValue([]);
    divergenceSvc.compare.mockRejectedValue(new Error('write failed'));

    const summary = await job.reconcileDate(DUTY_DATE);
    expect(summary.errors).toBe(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('logs completion with summary metadata', async () => {
    await job.reconcileDate(DUTY_DATE);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
      expect.objectContaining({ processingStage: 'HIS_RECONCILIATION', success: true }),
    );
  });

  it('passes HIS_RECON_BATCH_SIZE to Oracle query limit', async () => {
    process.env['HIS_RECON_BATCH_SIZE'] = '42';
    await job.reconcileDate(DUTY_DATE);
    expect(oracle.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 42 }),
    );
  });
});
