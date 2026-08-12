/**
 * Phase 0.5 — GAP-09 regression test
 *
 * Verifies that AttendanceListener.tick() persists status='QUEUED' to the
 * database (via PunchHistoryService.markAsQueued) BEFORE calling
 * RealtimeQueueService.enqueue.
 *
 * Prior to the fix, event.status was mutated in-memory but never saved,
 * meaning the DB record stayed at 'NEW' even after the job was enqueued.
 */

import { AttendanceListener } from '../services/attendance-listener.service';
import type { OraclePollingService } from '../services/oracle-polling.service';
import type { PunchHistoryService } from '../services/punch-history.service';
import type { RealtimeQueueService } from '../services/realtime-queue.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { LicenseService } from '../../licensing/license.service';
import type { AttlogPunch } from '../attendance.types';
import type { AttendanceEvent } from '../entities/attendance-event.entity';

// ATTENDANCE is licensed by default in these tests -- tick()/backfillTick()'s
// license gate (see attendance-listener.service.ts) would otherwise
// short-circuit every test below before any of the actual logic under test
// ever runs.
function makeLicenseService(licensed = true) {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(licensed),
  } as unknown as jest.Mocked<LicenseService>;
}

function makePunch(overrides: Partial<AttlogPunch> = {}): AttlogPunch {
  return {
    sourceId: 'src-001',
    employeeCode: 'EMP001',
    logDateTime: new Date('2026-07-01T08:00:00.000Z'),
    deviceName: 'DEV-A',
    direction: 'IN',
    rawDirection: 'IN',
    ipAddress: null,
    serialNumber: null,
    intraBranchId: null,
    createdAt: null,
    raw: {},
    ...overrides,
  };
}

function makeEvent(status: AttendanceEvent['status'] = 'NEW'): AttendanceEvent {
  return {
    id: 'evt-uuid-001',
    sourceId: 'src-001',
    idempotencyKey: 'EMP001:2026-07-01',
    employeeCode: 'EMP001',
    logDateTime: new Date('2026-07-01T08:00:00.000Z'),
    deviceName: 'DEV-A',
    direction: 'IN',
    rawDirection: 'IN',
    rawPayload: {},
    status,
    decisionStatus: null,
    attemptCount: 0,
    lastAttemptAt: null,
    errorMessage: null,
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as AttendanceEvent;
}

describe('AttendanceListener — Phase 0.5 (GAP-09)', () => {
  let listener: AttendanceListener;

  let pollingService: jest.Mocked<OraclePollingService>;
  let punchHistory: jest.Mocked<PunchHistoryService>;
  let queueService: jest.Mocked<RealtimeQueueService>;
  let attendanceLogger: jest.Mocked<AttendanceStructuredLogger>;
  let attendanceConfig: jest.Mocked<AttendanceConfigService>;

  const callOrder: string[] = [];

  beforeEach(() => {
    callOrder.length = 0;

    pollingService = {
      fetchNewPunches: jest.fn(),
      fetchBackfillPunches: jest.fn(),
    } as unknown as jest.Mocked<OraclePollingService>;

    punchHistory = {
      recordDiscoveredPunch: jest.fn(),
      markAsQueued: jest.fn(),
    } as unknown as jest.Mocked<PunchHistoryService>;

    queueService = {
      enqueue: jest.fn(),
    } as unknown as jest.Mocked<RealtimeQueueService>;

    attendanceLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      time: jest.fn(() => Date.now()),
      elapsed: jest.fn(() => 1),
    } as unknown as jest.Mocked<AttendanceStructuredLogger>;

    attendanceConfig = {
      getRuntimeConfig: jest.fn(async () => ({
        pollBatchSize: 500,
        staleQueuedMs: 5 * 60_000,
        backfillWindowDays: 7,
        backfillBatchSize: 2000,
      })),
    } as unknown as jest.Mocked<AttendanceConfigService>;

    listener = new AttendanceListener(
      pollingService,
      punchHistory,
      queueService,
      attendanceLogger,
      attendanceConfig,
      makeLicenseService(),
    );
  });

  describe('tick() — new punch event', () => {
    it('calls markAsQueued before enqueue (GAP-09)', async () => {
      const punch = makePunch();
      const newEvent = makeEvent('NEW');
      const queuedEvent = makeEvent('QUEUED');

      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(newEvent);

      punchHistory.markAsQueued.mockImplementation(async () => {
        callOrder.push('markAsQueued');
        return queuedEvent;
      });
      queueService.enqueue.mockImplementation(async () => {
        callOrder.push('enqueue');
      });

      await listener.tick();

      expect(callOrder).toEqual(['markAsQueued', 'enqueue']);
    });

    it('enqueue receives the ID from the saved (QUEUED) record', async () => {
      const punch = makePunch();
      const newEvent = makeEvent('NEW');
      const queuedEvent = { ...makeEvent('QUEUED'), id: 'saved-id-after-persist' };

      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(newEvent);
      punchHistory.markAsQueued.mockResolvedValue(queuedEvent as AttendanceEvent);
      queueService.enqueue.mockResolvedValue(undefined);

      await listener.tick();

      expect(queueService.enqueue).toHaveBeenCalledWith(
        'saved-id-after-persist',
        queuedEvent.employeeCode,
        queuedEvent.logDateTime,
      );
    });

    it('returns queued count equal to number of newly-queued punches', async () => {
      const punch1 = makePunch({ sourceId: 'a', employeeCode: 'EMP001' });
      const punch2 = makePunch({ sourceId: 'b', employeeCode: 'EMP002' });

      pollingService.fetchNewPunches.mockResolvedValue([punch1, punch2]);
      punchHistory.recordDiscoveredPunch
        .mockResolvedValueOnce(makeEvent('NEW'))
        .mockResolvedValueOnce(makeEvent('NEW'));
      punchHistory.markAsQueued.mockImplementation(
        async (e) => ({ ...e, status: 'QUEUED' } as AttendanceEvent),
      );
      queueService.enqueue.mockResolvedValue(undefined);

      const count = await listener.tick();

      expect(count).toBe(2);
      expect(punchHistory.markAsQueued).toHaveBeenCalledTimes(2);
    });
  });

  describe('tick() — already-processed events', () => {
    it('skips events with status PROCESSED without calling markAsQueued', async () => {
      const punch = makePunch();
      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('PROCESSED'));

      await listener.tick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
    });

    it('skips a freshly-QUEUED event without re-enqueuing (a live Bull job is presumably driving it)', async () => {
      const punch = makePunch();
      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      // updatedAt defaults to "now" in makeEvent() — well under staleQueuedMs.
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('QUEUED'));

      await listener.tick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
    });

    it('recovers an event stuck at QUEUED past staleQueuedMs by re-enqueuing it (orphaned Bull job)', async () => {
      const punch = makePunch();
      const staleQueued = {
        ...makeEvent('QUEUED'),
        updatedAt: new Date(Date.now() - 10 * 60_000), // 10 minutes ago > 5 minute default
      };
      const reQueuedEvent = { ...staleQueued, status: 'QUEUED' as const };

      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(staleQueued as AttendanceEvent);
      punchHistory.markAsQueued.mockResolvedValue(reQueuedEvent as AttendanceEvent);
      queueService.enqueue.mockResolvedValue(undefined);

      const count = await listener.tick();

      expect(punchHistory.markAsQueued).toHaveBeenCalledWith(staleQueued);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        reQueuedEvent.id,
        reQueuedEvent.employeeCode,
        reQueuedEvent.logDateTime,
      );
      expect(count).toBe(1);
    });

    it('skips a DEAD_LETTER event without re-enqueuing (terminal — must be revived via reprocessEvent/reprocessWindow)', async () => {
      // Regression test: before this check existed, DEAD_LETTER fell through
      // to the same re-enqueue path as NEW/FAILED, and since attemptCount is
      // never reset by re-enqueuing alone, every re-attempt immediately hit
      // the >=5 ceiling in AttendanceProcessor and flipped back to
      // DEAD_LETTER — producing an infinite loop that hammered Oracle with
      // the same failing statement on every tick (observed in production:
      // attemptCount climbing past 260+ for a single event).
      const punch = makePunch();
      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('DEAD_LETTER'));

      const count = await listener.tick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('skips a SKIPPED event without re-enqueuing (terminal by design, e.g. NO_ROSTER/INVALID)', async () => {
      const punch = makePunch();
      pollingService.fetchNewPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('SKIPPED'));

      await listener.tick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('tick() — concurrency guard', () => {
    it('returns 0 and does not poll if already running', async () => {
      let resolve!: () => void;
      pollingService.fetchNewPunches.mockReturnValue(
        new Promise<AttlogPunch[]>((r) => { resolve = () => r([]); }),
      );

      const first = listener.tick();
      const second = listener.tick();

      expect(await second).toBe(0);
      resolve();
      await first;
    });
  });

  describe('tick() — Oracle polling failure', () => {
    it('returns 0 and logs warn on Oracle error without throwing', async () => {
      pollingService.fetchNewPunches.mockRejectedValue(new Error('Oracle connection lost'));

      const result = await listener.tick();

      expect(result).toBe(0);
      expect(attendanceLogger.warn).toHaveBeenCalledWith(
        'Attendance polling tick failed',
        expect.objectContaining({ success: false, failure: true }),
      );
    });
  });

  describe('backfillTick() — safety-net sweep for punches the cursor may have missed', () => {
    it('calls fetchBackfillPunches with the configured window/batch size and queues any newly-discovered punch', async () => {
      const punch = makePunch();
      pollingService.fetchBackfillPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('NEW'));
      punchHistory.markAsQueued.mockResolvedValue(makeEvent('QUEUED'));
      queueService.enqueue.mockResolvedValue(undefined);

      const count = await listener.backfillTick();

      expect(pollingService.fetchBackfillPunches).toHaveBeenCalledWith(7, 2000);
      expect(count).toBe(1);
    });

    it('is a no-op for punches already known (dedup via recordDiscoveredPunch/sourceId) — safe to re-sweep overlapping windows', async () => {
      const punch = makePunch();
      pollingService.fetchBackfillPunches.mockResolvedValue([punch]);
      // Already PROCESSED — recordDiscoveredPunch returns the existing row unchanged.
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('PROCESSED'));

      const count = await listener.backfillTick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('does not re-enqueue a DEAD_LETTER event found during a backfill sweep either', async () => {
      const punch = makePunch();
      pollingService.fetchBackfillPunches.mockResolvedValue([punch]);
      punchHistory.recordDiscoveredPunch.mockResolvedValue(makeEvent('DEAD_LETTER'));

      const count = await listener.backfillTick();

      expect(punchHistory.markAsQueued).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('returns 0 and logs warn on Oracle error without throwing', async () => {
      pollingService.fetchBackfillPunches.mockRejectedValue(new Error('Oracle connection lost'));

      const result = await listener.backfillTick();

      expect(result).toBe(0);
      expect(attendanceLogger.warn).toHaveBeenCalledWith(
        'Attendance backfill sweep failed',
        expect.objectContaining({ success: false, failure: true }),
      );
    });

    it('returns 0 and does not sweep again if a sweep is already running (concurrency guard)', async () => {
      let resolve!: () => void;
      pollingService.fetchBackfillPunches.mockReturnValue(
        new Promise<AttlogPunch[]>((r) => { resolve = () => r([]); }),
      );

      const first = listener.backfillTick();
      const second = listener.backfillTick();

      expect(await second).toBe(0);
      resolve();
      await first;
    });
  });
});
