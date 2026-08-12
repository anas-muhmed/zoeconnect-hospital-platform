/**
 * NpnlSweepService — early NPNL flagging.
 *
 * For a rostered employee whose shift-start grace period has elapsed with no
 * punch, this sweep creates a synthetic AttendanceEvent and runs it through
 * the normal AttendanceProcessor.processEvent() pipeline so the existing
 * decision engine / governance / DUTYACTUALVALUES-write logic all apply
 * unchanged. It must be idempotent — never re-flag an employee who already
 * has an attendance_events row for the day (whether from a real punch or an
 * earlier sweep tick).
 */

import { NpnlSweepService } from '../services/npnl-sweep.service';
import type { Repository } from 'typeorm';
import type { AttendanceEvent } from '../entities/attendance-event.entity';
import type { RosterResolver } from '../services/roster-resolver.service';
import type { AttendanceProcessor } from '../services/attendance-processor.service';
import type { AttendanceConfigService } from '../services/attendance-config.service';
import type { AttendanceStructuredLogger } from '../services/attendance-structured-logger.service';
import type { LicenseService } from '../../licensing/license.service';

function makeEventRepo(existingCount = 0) {
  return {
    count: jest.fn().mockResolvedValue(existingCount),
    create: jest.fn((data: Partial<AttendanceEvent>) => ({ id: 'evt-new', ...data } as AttendanceEvent)),
    save: jest.fn(async (event: AttendanceEvent) => event),
  } as unknown as jest.Mocked<Repository<AttendanceEvent>>;
}

function makeRosterResolver(candidates: { employeeCode: string; dutyDate: Date; plannedIn: Date | null }[]) {
  return {
    findNpnlSweepCandidates: jest.fn().mockResolvedValue(candidates),
  } as unknown as jest.Mocked<RosterResolver>;
}

function makeProcessor() {
  return {
    processEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AttendanceProcessor>;
}

function makeAttendanceConfig() {
  return {
    getRuntimeConfig: jest.fn(async () => ({
      npnlSweepEnabled: true,
      npnlGraceMinutes: 15,
      npnlSweepIntervalMs: 5 * 60_000,
      npnlSweepBatchSize: 5000,
    })),
  } as unknown as jest.Mocked<AttendanceConfigService>;
}

function makeLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    time: jest.fn(() => Date.now()),
    elapsed: jest.fn(() => 1),
  } as unknown as jest.Mocked<AttendanceStructuredLogger>;
}

// ATTENDANCE is licensed by default in these tests -- sweep()'s license gate
// (see npnl-sweep.service.ts) would otherwise short-circuit every test below
// before any of the actual sweep logic under test ever runs.
function makeLicenseService(licensed = true) {
  return {
    isModuleLicensed: jest.fn().mockResolvedValue(licensed),
  } as unknown as jest.Mocked<LicenseService>;
}

describe('NpnlSweepService.sweep()', () => {
  const dutyDate = new Date('2026-07-04T00:00:00.000Z');
  const plannedIn = new Date('2026-07-04T09:00:00.000Z');

  it('creates a synthetic NEW event and processes it via NPNL_SWEEP mode for a genuine no-punch candidate', async () => {
    const eventRepo = makeEventRepo(0); // no existing event today
    const rosterResolver = makeRosterResolver([{ employeeCode: 'EMP001', dutyDate, plannedIn }]);
    const processor = makeProcessor();

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      makeLogger(),
      makeLicenseService(),
    );

    const result = await service.sweep();

    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeCode: 'EMP001',
        status: 'NEW',
        direction: 'UNKNOWN',
        sourceId: 'NPNL_SWEEP:EMP001:2026-07-04',
      }),
    );
    expect(processor.processEvent).toHaveBeenCalledWith('evt-new', 'NPNL_SWEEP');
    expect(result).toEqual({ candidates: 1, flagged: 1 });
  });

  it('skips a candidate that already has an attendance_events row today (real punch or earlier sweep)', async () => {
    const eventRepo = makeEventRepo(1); // an event already exists
    const rosterResolver = makeRosterResolver([{ employeeCode: 'EMP002', dutyDate, plannedIn }]);
    const processor = makeProcessor();

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      makeLogger(),
      makeLicenseService(),
    );

    const result = await service.sweep();

    expect(eventRepo.create).not.toHaveBeenCalled();
    expect(processor.processEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: 1, flagged: 0 });
  });

  it('continues the sweep for remaining candidates if one candidate fails', async () => {
    const eventRepo = makeEventRepo(0);
    const rosterResolver = makeRosterResolver([
      { employeeCode: 'EMP003', dutyDate, plannedIn },
      { employeeCode: 'EMP004', dutyDate, plannedIn },
    ]);
    const processor = makeProcessor();
    processor.processEvent
      .mockRejectedValueOnce(new Error('Oracle write failed'))
      .mockResolvedValueOnce(undefined);

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      makeLogger(),
      makeLicenseService(),
    );

    const result = await service.sweep();

    expect(processor.processEvent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ candidates: 2, flagged: 1 });
  });

  it('treats a duplicate-sourceId save failure as a benign race with a concurrent sweep, not an error', async () => {
    const eventRepo = makeEventRepo(0);
    eventRepo.save.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
    const rosterResolver = makeRosterResolver([{ employeeCode: 'EMP005', dutyDate, plannedIn }]);
    const processor = makeProcessor();

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      makeLogger(),
      makeLicenseService(),
    );

    const result = await service.sweep();

    expect(processor.processEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ candidates: 1, flagged: 0 });
  });

  it('returns zeroed result and does not sweep again if a sweep is already running (concurrency guard)', async () => {
    const eventRepo = makeEventRepo(0);
    let resolveCandidates!: (v: { employeeCode: string; dutyDate: Date; plannedIn: Date | null }[]) => void;
    const rosterResolver = {
      findNpnlSweepCandidates: jest.fn().mockReturnValue(
        new Promise((r) => { resolveCandidates = r; }),
      ),
    } as unknown as jest.Mocked<RosterResolver>;
    const processor = makeProcessor();

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      makeLogger(),
      makeLicenseService(),
    );

    const first = service.sweep();
    const second = await service.sweep();

    expect(second).toEqual({ candidates: 0, flagged: 0 });
    resolveCandidates([]);
    await first;
  });

  it('returns zeroed result and logs a warning if the roster scan throws', async () => {
    const eventRepo = makeEventRepo(0);
    const rosterResolver = {
      findNpnlSweepCandidates: jest.fn().mockRejectedValue(new Error('Oracle unavailable')),
    } as unknown as jest.Mocked<RosterResolver>;
    const processor = makeProcessor();
    const logger = makeLogger();

    const service = new NpnlSweepService(
      eventRepo,
      rosterResolver,
      processor,
      makeAttendanceConfig(),
      logger,
      makeLicenseService(),
    );

    const result = await service.sweep();

    expect(result).toEqual({ candidates: 0, flagged: 0 });
    expect(logger.warn).toHaveBeenCalledWith(
      'NPNL early-flag sweep failed',
      expect.objectContaining({ success: false, failure: true }),
    );
  });
});
