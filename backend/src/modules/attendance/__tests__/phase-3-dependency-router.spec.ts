/**
 * Phase 3 — DependencyRecalculationService + DependencyEventRouter (Phase 3 path)
 *
 * Coverage:
 *   DependencyRecalculationService
 *     • EMPLOYEE scope: queries by (employeeCode, dayBounds) + deduplicates
 *     • GLOBAL scope: queries by dayBounds across all employees + deduplicates
 *     • CONFIG scope: queries lookback window + deduplicates
 *     • null scope falls back to EMPLOYEE logic
 *     • returns 0 when EMPLOYEE scope is missing required fields
 *     • returns 0 when GLOBAL scope is missing dutyDate
 *     • deduplication keeps only the earliest event per (employee, date)
 *     • enqueue failures are swallowed — count reflects successful enqueues only
 *     • respects DEPENDENCY_CONFIG_LOOKBACK_DAYS and DEPENDENCY_CONFIG_RECALC_LIMIT env vars
 *
 *   DependencyEventRouter (Phase 3 dispatch path)
 *     • non-DUTY_PLAN events call recalcService.resolveAndEnqueue + set status ROUTED
 *     • DUTY_PLAN events still go through debounce (recalcService NOT called during debounce window)
 *     • routing failure (recalcService throws) sets status FAILED
 *     • flushDebounced calls recalcService after window expires
 */

import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { DependencyRecalculationService } from '../services/dependency-recalculation.service';
import { DependencyEventRouter } from '../services/dependency-event-router.service';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { AttendanceDependencyEvent } from '../entities/attendance-dependency-event.entity';
import { RealtimeQueueService } from '../services/realtime-queue.service';
import { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import { AttendanceDependencyChangedEvent } from '../events/attendance-dependency-changed.event';
import type { DependencyEventScope } from '../events/attendance-dependency-changed.event';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { LicenseService } from '../../licensing/license.service';
import { randomUUID } from 'crypto';

// attendanceConfig (added to DependencyRecalculationService's/
// DependencyEventRouter's constructors since this test was last updated).
// Reads process.env at CALL time so this file's existing per-test env var
// mutations (DEPENDENCY_CONFIG_LOOKBACK_DAYS, DEPENDENCY_CONFIG_RECALC_LIMIT,
// DEPENDENCY_GLOBAL_RECALC_LIMIT, DEPENDENCY_ROUTER_ENABLED,
// DEPENDENCY_DUTYPLAN_DEBOUNCE_MS) keep working exactly as before.
function makeAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    getRuntimeConfig: jest.fn().mockImplementation(async () => ({
      depConfigLookbackDays: Number(process.env['DEPENDENCY_CONFIG_LOOKBACK_DAYS'] ?? 7),
      depConfigRecalcLimit:  Number(process.env['DEPENDENCY_CONFIG_RECALC_LIMIT'] ?? 1000),
      depGlobalRecalcLimit:  Number(process.env['DEPENDENCY_GLOBAL_RECALC_LIMIT'] ?? 1000),
      depRouterEnabled:      process.env['DEPENDENCY_ROUTER_ENABLED'] !== 'false',
      depDutyplanDebounceMs: Number(process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] ?? 5000),
    })),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

function makeLicenseService(): jest.Mocked<LicenseService> {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<LicenseService>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAttendanceEvent(
  employeeCode: string,
  logDateTime: Date,
  id = randomUUID(),
): AttendanceEvent {
  return {
    id,
    employeeCode,
    logDateTime,
    sourceId: `src-${id}`,
    idempotencyKey: `ikey-${id}`,
    direction: 'IN',
    rawDirection: null,
    status: 'PROCESSED',
    decisionStatus: null,
    attemptCount: 1,
    lastError: null,
    processedAt: null,
    rawPayload: {},
    createdAt: logDateTime,
    updatedAt: logDateTime,
    deviceName: null,
  } as AttendanceEvent;
}

function makeDepRecord(overrides: Partial<AttendanceDependencyEvent> = {}): AttendanceDependencyEvent {
  return {
    id: randomUUID(),
    source: 'LEAVE',
    scope: 'EMPLOYEE' as DependencyEventScope,
    employeeCode: 'EMP001',
    dutyDate: new Date('2025-06-15T00:00:00.000Z'),
    triggeredAt: new Date(),
    status: 'PENDING',
    payload: {},
    correlationId: randomUUID(),
    debounceUntil: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AttendanceDependencyEvent;
}

function makeEventRepo(returnValues: AttendanceEvent[] = []): jest.Mocked<Repository<AttendanceEvent>> {
  return {
    find: jest.fn(async () => returnValues),
  } as unknown as jest.Mocked<Repository<AttendanceEvent>>;
}

function makeQueueService(): jest.Mocked<RealtimeQueueService> {
  return {
    enqueue: jest.fn(async () => {}),
  } as unknown as jest.Mocked<RealtimeQueueService>;
}

function makeLogger(): jest.Mocked<AttendanceStructuredLogger> {
  return {
    info:    jest.fn(),
    warn:    jest.fn(),
    error:   jest.fn(),
    time:    jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 0),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

function makeRecalcService(enqueued = 1): jest.Mocked<DependencyRecalculationService> {
  return {
    resolveAndEnqueue: jest.fn(async () => enqueued),
  } as unknown as jest.Mocked<DependencyRecalculationService>;
}

function makeDepRepo(saved: AttendanceDependencyEvent[] = []): jest.Mocked<Repository<AttendanceDependencyEvent>> {
  const repo = {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (e) => {
      saved.push(e as AttendanceDependencyEvent);
      return e;
    }),
    update: jest.fn(async () => {}),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    })),
  } as unknown as jest.Mocked<Repository<AttendanceDependencyEvent>>;
  return repo;
}

// ── DependencyRecalculationService ────────────────────────────────────────────

describe('DependencyRecalculationService', () => {
  let eventRepo: jest.Mocked<Repository<AttendanceEvent>>;
  let queueService: jest.Mocked<RealtimeQueueService>;
  let logger: jest.Mocked<AttendanceStructuredLogger>;
  let svc: DependencyRecalculationService;

  beforeEach(() => {
    eventRepo    = makeEventRepo();
    queueService = makeQueueService();
    logger       = makeLogger();
    svc          = new DependencyRecalculationService(eventRepo as any, queueService, logger, makeAttendanceConfig());

    delete process.env['DEPENDENCY_CONFIG_LOOKBACK_DAYS'];
    delete process.env['DEPENDENCY_CONFIG_RECALC_LIMIT'];
    delete process.env['DEPENDENCY_GLOBAL_RECALC_LIMIT'];
  });

  describe('EMPLOYEE scope', () => {
    it('queries by employeeCode + dayBounds and enqueues one event per (employee, date)', async () => {
      const dutyDate = new Date('2025-06-15T00:00:00.000Z');
      const events = [
        makeAttendanceEvent('EMP001', new Date('2025-06-15T08:00:00.000Z')),
        makeAttendanceEvent('EMP001', new Date('2025-06-15T17:00:00.000Z')),
      ];
      eventRepo.find.mockResolvedValue(events);

      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: 'EMP001', dutyDate });
      const count = await svc.resolveAndEnqueue(depRecord);

      // Only 1 unique (employee, date) pair — second punch is deduplicated
      expect(count).toBe(1);
      expect(queueService.enqueue).toHaveBeenCalledTimes(1);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        events[0].id,
        'EMP001',
        events[0].logDateTime,
        'DEPENDENCY_RECALC',
      );
    });

    it('queries with correct employeeCode filter', async () => {
      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: 'EMPXYZ', dutyDate: new Date('2025-07-01') });
      eventRepo.find.mockResolvedValue([]);
      await svc.resolveAndEnqueue(depRecord);

      expect(eventRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ employeeCode: 'EMPXYZ' }),
      }));
    });

    it('returns 0 and warns when employeeCode is null', async () => {
      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: null, dutyDate: new Date('2025-06-15') });
      const count = await svc.resolveAndEnqueue(depRecord);
      expect(count).toBe(0);
      expect(queueService.enqueue).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 0 and warns when dutyDate is null', async () => {
      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: 'EMP001', dutyDate: null });
      const count = await svc.resolveAndEnqueue(depRecord);
      expect(count).toBe(0);
      expect(queueService.enqueue).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 0 when no attendance events exist for that day', async () => {
      eventRepo.find.mockResolvedValue([]);
      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: 'EMP001', dutyDate: new Date('2025-06-15') });
      const count = await svc.resolveAndEnqueue(depRecord);
      expect(count).toBe(0);
      expect(queueService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('GLOBAL scope', () => {
    it('queries across all employees for that date and deduplicates per employee', async () => {
      const dutyDate = new Date('2025-06-15T00:00:00.000Z');
      const events = [
        makeAttendanceEvent('EMP001', new Date('2025-06-15T08:00:00.000Z')),
        makeAttendanceEvent('EMP001', new Date('2025-06-15T17:00:00.000Z')), // duplicate for EMP001
        makeAttendanceEvent('EMP002', new Date('2025-06-15T09:00:00.000Z')),
      ];
      eventRepo.find.mockResolvedValue(events);

      const depRecord = makeDepRecord({ scope: 'GLOBAL', employeeCode: null, dutyDate, source: 'HOLIDAY' });
      const count = await svc.resolveAndEnqueue(depRecord);

      // 2 unique employees on that date
      expect(count).toBe(2);
      expect(queueService.enqueue).toHaveBeenCalledTimes(2);
    });

    it('does NOT filter by employeeCode', async () => {
      const depRecord = makeDepRecord({ scope: 'GLOBAL', employeeCode: null, dutyDate: new Date('2025-06-15') });
      eventRepo.find.mockResolvedValue([]);
      await svc.resolveAndEnqueue(depRecord);

      const call = eventRepo.find.mock.calls[0]![0] as any;
      expect(call.where).not.toHaveProperty('employeeCode');
    });

    it('returns 0 and warns when dutyDate is null', async () => {
      const depRecord = makeDepRecord({ scope: 'GLOBAL', employeeCode: null, dutyDate: null });
      const count = await svc.resolveAndEnqueue(depRecord);
      expect(count).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('respects DEPENDENCY_GLOBAL_RECALC_LIMIT env var', async () => {
      process.env['DEPENDENCY_GLOBAL_RECALC_LIMIT'] = '3';
      eventRepo.find.mockResolvedValue([]);
      const depRecord = makeDepRecord({ scope: 'GLOBAL', employeeCode: null, dutyDate: new Date('2025-06-15') });
      await svc.resolveAndEnqueue(depRecord);

      expect(eventRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });
  });

  describe('CONFIG scope', () => {
    it('queries lookback window and deduplicates per (employee, date)', async () => {
      const now = Date.now();
      const events = [
        makeAttendanceEvent('EMP001', new Date(now - 1 * 24 * 60 * 60 * 1000)), // yesterday
        makeAttendanceEvent('EMP001', new Date(now - 1 * 24 * 60 * 60 * 1000 + 3600_000)), // same day as above
        makeAttendanceEvent('EMP002', new Date(now - 2 * 24 * 60 * 60 * 1000)),
      ];
      eventRepo.find.mockResolvedValue(events);

      const depRecord = makeDepRecord({ scope: 'CONFIG', employeeCode: null, dutyDate: null, source: 'SHIFT_TYPE' });
      const count = await svc.resolveAndEnqueue(depRecord);

      // EMP001×1 (deduped) + EMP002×1 = 2
      expect(count).toBe(2);
      expect(queueService.enqueue).toHaveBeenCalledTimes(2);
    });

    it('defaults to 7-day lookback', async () => {
      const now = new Date();
      eventRepo.find.mockResolvedValue([]);
      const depRecord = makeDepRecord({ scope: 'CONFIG', employeeCode: null, dutyDate: null });
      await svc.resolveAndEnqueue(depRecord);

      const call = eventRepo.find.mock.calls[0]![0] as any;
      const from: Date = call.where.logDateTime.value;
      const diffDays = (now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it('respects DEPENDENCY_CONFIG_LOOKBACK_DAYS env var', async () => {
      process.env['DEPENDENCY_CONFIG_LOOKBACK_DAYS'] = '14';
      const now = new Date();
      eventRepo.find.mockResolvedValue([]);
      const depRecord = makeDepRecord({ scope: 'CONFIG', employeeCode: null, dutyDate: null });
      await svc.resolveAndEnqueue(depRecord);

      const call = eventRepo.find.mock.calls[0]![0] as any;
      const from: Date = call.where.logDateTime.value;
      const diffDays = (now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(14, 0);
    });

    it('respects DEPENDENCY_CONFIG_RECALC_LIMIT env var', async () => {
      process.env['DEPENDENCY_CONFIG_RECALC_LIMIT'] = '500';
      eventRepo.find.mockResolvedValue([]);
      const depRecord = makeDepRecord({ scope: 'CONFIG', employeeCode: null, dutyDate: null });
      await svc.resolveAndEnqueue(depRecord);

      expect(eventRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });
  });

  describe('null scope fallback', () => {
    it('falls back to EMPLOYEE logic when scope is null', async () => {
      const events = [makeAttendanceEvent('EMP001', new Date('2025-06-15T08:00:00.000Z'))];
      eventRepo.find.mockResolvedValue(events);

      const depRecord = makeDepRecord({ scope: null as any, employeeCode: 'EMP001', dutyDate: new Date('2025-06-15') });
      const count = await svc.resolveAndEnqueue(depRecord);

      expect(count).toBe(1);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        events[0].id, 'EMP001', events[0].logDateTime, 'DEPENDENCY_RECALC',
      );
    });
  });

  describe('enqueue failure resilience', () => {
    it('continues enqueuing remaining events when one enqueue fails', async () => {
      const events = [
        makeAttendanceEvent('EMP001', new Date('2025-06-15T08:00:00.000Z')),
        makeAttendanceEvent('EMP002', new Date('2025-06-15T09:00:00.000Z')),
        makeAttendanceEvent('EMP003', new Date('2025-06-15T10:00:00.000Z')),
      ];
      eventRepo.find.mockResolvedValue(events);

      // First enqueue fails
      queueService.enqueue
        .mockRejectedValueOnce(new Error('Redis down'))
        .mockResolvedValue(undefined);

      const depRecord = makeDepRecord({ scope: 'GLOBAL', employeeCode: null, dutyDate: new Date('2025-06-15') });
      const count = await svc.resolveAndEnqueue(depRecord);

      // 2 out of 3 succeeded
      expect(count).toBe(2);
      expect(queueService.enqueue).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('never throws — errors are fully swallowed per event', async () => {
      eventRepo.find.mockResolvedValue([makeAttendanceEvent('E1', new Date())]);
      queueService.enqueue.mockRejectedValue(new Error('boom'));

      const depRecord = makeDepRecord({ scope: 'EMPLOYEE', employeeCode: 'E1', dutyDate: new Date() });
      await expect(svc.resolveAndEnqueue(depRecord)).resolves.not.toThrow();
    });
  });
});

// ── DependencyEventRouter — Phase 3 dispatch path ─────────────────────────────

describe('DependencyEventRouter (Phase 3 dispatch)', () => {
  let depRepo: jest.Mocked<Repository<AttendanceDependencyEvent>>;
  let logger: jest.Mocked<AttendanceStructuredLogger>;
  let recalcService: jest.Mocked<DependencyRecalculationService>;
  let router: DependencyEventRouter;
  let saved: AttendanceDependencyEvent[];

  function makeLeaveEvent(overrides: { source?: string; scope?: DependencyEventScope | null; employeeCode?: string | null; dutyDate?: Date | null } = {}): AttendanceDependencyChangedEvent {
    return new AttendanceDependencyChangedEvent({
      source: 'LEAVE',
      scope: 'EMPLOYEE',
      employeeCode: 'EMP001',
      dutyDate: new Date('2025-06-15'),
      triggeredAt: new Date(),
      correlationId: randomUUID(),
      payload: {},
      ...(overrides as Record<string, unknown>),
    } as any);
  }

  beforeEach(() => {
    saved         = [];
    depRepo       = makeDepRepo(saved);
    logger        = makeLogger();
    recalcService = makeRecalcService(1);
    router        = new DependencyEventRouter(depRepo as any, logger, recalcService, makeAttendanceConfig(), makeLicenseService());

    delete process.env['DEPENDENCY_ROUTER_ENABLED'];
    delete process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('non-DUTY_PLAN event calls resolveAndEnqueue and sets status ROUTED', async () => {
    const event = makeLeaveEvent({ source: 'LEAVE', scope: 'EMPLOYEE' });
    await router.route(event);

    expect(recalcService.resolveAndEnqueue).toHaveBeenCalledTimes(1);
    const routedRecord = saved.find((r) => r.status === 'ROUTED');
    expect(routedRecord).toBeDefined();
  });

  it('HOLIDAY event (GLOBAL scope) calls resolveAndEnqueue', async () => {
    const event = makeLeaveEvent({ source: 'HOLIDAY', scope: 'GLOBAL', employeeCode: null });
    await router.route(event);
    expect(recalcService.resolveAndEnqueue).toHaveBeenCalledTimes(1);
    const routedRecord = saved.find((r) => r.status === 'ROUTED');
    expect(routedRecord).toBeDefined();
  });

  it('SHIFT_TYPE event (CONFIG scope) calls resolveAndEnqueue', async () => {
    const event = makeLeaveEvent({ source: 'SHIFT_TYPE', scope: 'CONFIG', employeeCode: null, dutyDate: null });
    await router.route(event);
    expect(recalcService.resolveAndEnqueue).toHaveBeenCalledTimes(1);
    const routedRecord = saved.find((r) => r.status === 'ROUTED');
    expect(routedRecord).toBeDefined();
  });

  it('DUTY_PLAN event does NOT call resolveAndEnqueue during debounce window', async () => {
    const event = makeLeaveEvent({ source: 'DUTY_PLAN', scope: 'EMPLOYEE' });
    process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] = '5000';
    await router.route(event);

    expect(recalcService.resolveAndEnqueue).not.toHaveBeenCalled();
    const debouncedRecord = saved.find((r) => r.status === 'DEBOUNCED');
    expect(debouncedRecord).toBeDefined();
  });

  it('sets status FAILED and saves lastError when recalcService throws', async () => {
    recalcService.resolveAndEnqueue.mockRejectedValue(new Error('DB gone'));
    const event = makeLeaveEvent({ source: 'LEAVE' });
    await router.route(event);

    const failedRecord = saved.find((r) => r.status === 'FAILED');
    expect(failedRecord).toBeDefined();
    expect(failedRecord?.lastError).toBe('DB gone');
  });

  it('flushDebounced calls resolveAndEnqueue after debounce window expires', async () => {
    process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] = '1000';
    router.onApplicationBootstrap();

    const event = makeLeaveEvent({ source: 'DUTY_PLAN', scope: 'EMPLOYEE' });

    // Seed a DEBOUNCED record in the query builder mock
    const debouncedRecord = {
      ...makeDepRecord({ source: 'DUTY_PLAN', scope: 'EMPLOYEE', status: 'DEBOUNCED' }),
    };
    (depRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([debouncedRecord]),
    });

    await router.route(event);

    // Advance time past debounce window and let the setInterval fire once
    await jest.advanceTimersByTimeAsync(2000);

    expect(recalcService.resolveAndEnqueue).toHaveBeenCalled();
    router.onApplicationShutdown();
  });

  it('passes scope from persisted record to recalcService', async () => {
    const event = makeLeaveEvent({ source: 'HOLIDAY', scope: 'GLOBAL', employeeCode: null });
    await router.route(event);

    const passedRecord = recalcService.resolveAndEnqueue.mock.calls[0]![0];
    expect(passedRecord.scope).toBe('GLOBAL');
  });
});
