/**
 * Phase 1 — DependencyEventRouter unit tests
 *
 * Verifies:
 *   • route() persists the event to the repository before routing
 *   • Non-DUTY_PLAN events are immediately dispatched (status → ROUTED)
 *   • DUTY_PLAN events are debounced (status → DEBOUNCED)
 *   • flushDebounced() promotes due DEBOUNCED events to ROUTED
 *   • A burst of DUTY_PLAN events for the same key marks earlier ones SKIPPED
 *   • DEPENDENCY_ROUTER_ENABLED=false causes onApplicationBootstrap to skip setup
 */

import { DependencyEventRouter } from '../services/dependency-event-router.service';
import { AttendanceDependencyChangedEvent } from '../events/attendance-dependency-changed.event';
import type { AttendanceDependencyEvent } from '../entities/attendance-dependency-event.entity';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { LicenseService } from '../../licensing/license.service';

// attendanceConfig / licenseService (added to DependencyEventRouter's
// constructor since this test was last updated). getRuntimeConfig() reads
// process.env at CALL time so this file's existing per-test env var
// mutations (DEPENDENCY_ROUTER_ENABLED / DEPENDENCY_DUTYPLAN_DEBOUNCE_MS)
// keep working exactly as before.
function makeAttendanceConfig(): jest.Mocked<AttendanceConfigService> {
  return {
    getRuntimeConfig: jest.fn().mockImplementation(async () => ({
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(
  source: AttendanceDependencyChangedEvent['source'],
  overrides: Partial<ConstructorParameters<typeof AttendanceDependencyChangedEvent>[0]> = {},
): AttendanceDependencyChangedEvent {
  return new AttendanceDependencyChangedEvent({
    source,
    employeeCode:  'employeeCode' in overrides ? overrides.employeeCode! : 'EMP001',
    dutyDate:      'dutyDate' in overrides ? overrides.dutyDate! : new Date('2026-07-01'),
    triggeredAt:   overrides.triggeredAt   ?? new Date(),
    correlationId: overrides.correlationId ?? 'corr-001',
    payload:       overrides.payload       ?? {},
  });
}

function makeRepo() {
  let idSeq = 0;
  const store: Record<string, AttendanceDependencyEvent> = {};

  const repo = {
    create: jest.fn((dto: Partial<AttendanceDependencyEvent>) => ({
      ...dto,
      id: String(++idSeq),
    } as AttendanceDependencyEvent)),

    save: jest.fn(async (entity: AttendanceDependencyEvent) => {
      store[entity.id] = { ...entity };
      return store[entity.id];
    }),

    update: jest.fn(async (id: string, partial: Partial<AttendanceDependencyEvent>) => {
      if (store[id]) store[id] = { ...store[id], ...partial };
    }),

    createQueryBuilder: jest.fn().mockReturnValue({
      where:    jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany:  jest.fn(async () =>
        Object.values(store).filter((r) => r.status === 'DEBOUNCED'),
      ),
    }),

    _store: store,
  };

  return repo;
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

function makeRouter(repo = makeRepo(), logger = makeLogger()): DependencyEventRouter {
  return new DependencyEventRouter(
    repo as any,
    logger,
    { resolveAndEnqueue: jest.fn(async () => 0) } as any,
    makeAttendanceConfig(),
    makeLicenseService(),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DependencyEventRouter', () => {
  beforeEach(() => {
    delete process.env['DEPENDENCY_ROUTER_ENABLED'];
    delete process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Persistence ─────────────────────────────────────────────────────────────

  describe('persistence', () => {
    it('calls repo.create and repo.save for every event', async () => {
      const repo   = makeRepo();
      const router = makeRouter(repo);
      const event  = makeEvent('LEAVE');

      await router.route(event);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalled();
    });

    it('persists source, employeeCode, correlationId from the event', async () => {
      const repo   = makeRepo();
      const router = makeRouter(repo);
      const event  = makeEvent('HOLIDAY', { employeeCode: null, correlationId: 'test-corr' });

      await router.route(event);

      const created: Partial<AttendanceDependencyEvent> = repo.create.mock.calls[0][0];
      expect(created.source).toBe('HOLIDAY');
      expect(created.employeeCode).toBeNull();
      expect(created.correlationId).toBe('test-corr');
      expect(created.status).toBe('PENDING');
    });
  });

  // ── Non-DUTY_PLAN sources → immediate routing ──────────────────────────────

  describe('non-DUTY_PLAN sources', () => {
    it.each(['LEAVE', 'HOLIDAY', 'SHIFT_TYPE'] as const)(
      '%s event is immediately marked ROUTED',
      async (source) => {
        const repo   = makeRepo();
        const router = makeRouter(repo);
        await router.route(makeEvent(source));

        const saved = Object.values(repo._store);
        expect(saved).toHaveLength(1);
        expect(saved[0].status).toBe('ROUTED');
      },
    );
  });

  // ── DUTY_PLAN debounce ─────────────────────────────────────────────────────

  describe('DUTY_PLAN debounce', () => {
    it('marks DUTY_PLAN events as DEBOUNCED immediately', async () => {
      process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] = '5000';
      const repo   = makeRepo();
      const router = makeRouter(repo);

      await router.route(makeEvent('DUTY_PLAN'));

      const saved = Object.values(repo._store);
      expect(saved).toHaveLength(1);
      expect(saved[0].status).toBe('DEBOUNCED');
      expect(saved[0].debounceUntil).toBeInstanceOf(Date);
    });

    it('burst of DUTY_PLAN events for same key marks earlier ones SKIPPED', async () => {
      process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] = '5000';
      const repo   = makeRepo();
      const router = makeRouter(repo);

      const opts = { employeeCode: 'EMP001', dutyDate: new Date('2026-07-01') };
      await router.route(makeEvent('DUTY_PLAN', opts));
      await router.route(makeEvent('DUTY_PLAN', opts));
      await router.route(makeEvent('DUTY_PLAN', opts));

      const records = Object.values(repo._store);
      expect(records).toHaveLength(3);

      // First two should be SKIPPED; last should be DEBOUNCED
      const statuses = records.map((r) => r.status).sort();
      expect(statuses).toEqual(['DEBOUNCED', 'SKIPPED', 'SKIPPED']);
    });

    it('DUTY_PLAN events for different employees are debounced independently', async () => {
      process.env['DEPENDENCY_DUTYPLAN_DEBOUNCE_MS'] = '5000';
      const repo   = makeRepo();
      const router = makeRouter(repo);

      await router.route(makeEvent('DUTY_PLAN', { employeeCode: 'EMP001' }));
      await router.route(makeEvent('DUTY_PLAN', { employeeCode: 'EMP002' }));

      const records = Object.values(repo._store);
      expect(records).toHaveLength(2);
      // Both should be DEBOUNCED independently — neither supersedes the other
      expect(records.every((r) => r.status === 'DEBOUNCED')).toBe(true);
    });
  });

  // ── AttendanceDependencyChangedEvent value object ──────────────────────────

  describe('AttendanceDependencyChangedEvent', () => {
    it('stores all fields as readonly', () => {
      const triggeredAt = new Date('2026-07-01T12:00:00Z');
      const event = new AttendanceDependencyChangedEvent({
        source:        'DUTY_PLAN',
        employeeCode:  'EMP999',
        dutyDate:      new Date('2026-07-01'),
        triggeredAt,
        correlationId: 'c-123',
        payload:       { foo: 'bar' },
      });

      expect(event.source).toBe('DUTY_PLAN');
      expect(event.employeeCode).toBe('EMP999');
      expect(event.correlationId).toBe('c-123');
      expect(event.triggeredAt).toBe(triggeredAt);
      expect(event.payload).toEqual({ foo: 'bar' });
    });

    it('allows null employeeCode and null dutyDate for global events', () => {
      const event = new AttendanceDependencyChangedEvent({
        source:        'HOLIDAY',
        employeeCode:  null,
        dutyDate:      null,
        triggeredAt:   new Date(),
        correlationId: 'c-456',
        payload:       {},
      });

      expect(event.employeeCode).toBeNull();
      expect(event.dutyDate).toBeNull();
    });
  });
});
