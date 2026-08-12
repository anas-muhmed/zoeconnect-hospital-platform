import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Between, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { OraclePoolService } from '../../his/oracle-pool.service';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { OracleTenantResolver } from '../../platform/tenant/resolvers/oracle-tenant.resolver';
import type { AttlogPunch, PunchDirection } from '../attendance.types';

@Injectable()
export class PunchHistoryService {
  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    private readonly oracle: OraclePoolService,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    // Stage B (Checkpoint B4) — resolves tenant_id from the raw Oracle
    // INTRABRANCHID already present on every ATTLOGS row, at the single
    // point where AttendanceEvent rows are created (recordDiscoveredPunch).
    // This is the root write of the entire realtime pipeline; every
    // downstream write (audit, skip log, dependency snapshot) derives its
    // tenant_id from the roster/event context rather than re-resolving.
    private readonly oracleTenantResolver: OracleTenantResolver,
  ) {}

  makeSourceId(punch: Pick<AttlogPunch, 'employeeCode' | 'logDateTime' | 'deviceName' | 'rawDirection' | 'serialNumber'>): string {
    const raw = [
      punch.employeeCode,
      punch.logDateTime.toISOString(),
      punch.deviceName ?? '',
      punch.rawDirection ?? '',
      punch.serialNumber ?? '',
    ].join('|');
    return createHash('sha256').update(raw).digest('hex');
  }

  makeIdempotencyKey(employeeCode: string, dutyDate: Date): string {
    return `${employeeCode}:${this.toDateOnly(dutyDate)}`;
  }

  /**
   * Persists status = 'QUEUED' on an AttendanceEvent record before it is
   * handed to the Bull queue.  Callers MUST await this before calling
   * RealtimeQueueService.enqueue() so the status change is durable even if
   * the process crashes between the save and the enqueue call.
   *
   * GAP-09 fix: previously the status was mutated in-memory but never saved.
   */
  async markAsQueued(event: AttendanceEvent): Promise<AttendanceEvent> {
    event.status = 'QUEUED';
    return this.eventRepo.save(event);
  }

  /**
   * Resets a FAILED/DEAD_LETTER event back to a clean 'NEW' state so it can
   * be safely re-enqueued.
   *
   * IMPORTANT: attemptCount must be reset here, not left as-is. It is never
   * decremented anywhere else, so simply re-enqueuing a DEAD_LETTER event
   * without resetting attemptCount causes it to hit the >=5 ceiling in
   * AttendanceProcessor.processEvent() again after a single attempt and
   * immediately flip back to DEAD_LETTER — this is exactly what an earlier
   * (now-fixed) bug in attendance-listener.service.ts's tick() did every
   * poll cycle, in a tight infinite loop.
   */
  async resetForReprocessing(event: AttendanceEvent): Promise<AttendanceEvent> {
    event.status = 'NEW';
    event.attemptCount = 0;
    event.lastError = null;
    event.decisionStatus = null;
    event.processedAt = null;
    return this.eventRepo.save(event);
  }

  async findEventById(eventId: string): Promise<AttendanceEvent | null> {
    return this.eventRepo.findOne({ where: { id: eventId } });
  }

  async findEventsForReprocessing(
    from: Date,
    to: Date,
    statuses: AttendanceEvent['status'][] = ['FAILED', 'DEAD_LETTER'],
  ): Promise<AttendanceEvent[]> {
    return this.eventRepo
      .createQueryBuilder('event')
      .where('event.logDateTime BETWEEN :from AND :to', { from, to })
      .andWhere('event.status IN (:...statuses)', { statuses })
      .orderBy('event.logDateTime', 'ASC')
      .getMany();
  }

  async recordDiscoveredPunch(punch: AttlogPunch): Promise<AttendanceEvent> {
    const idempotencyKey = this.makeSourceId(punch);
    const existing = await this.eventRepo.findOne({ where: { sourceId: punch.sourceId } });
    if (existing) {
      this.attendanceLogger.info('ATTLOGS punch already recorded', {
        employeeCode: punch.employeeCode,
        attlogId: punch.sourceId,
        punchDirection: punch.direction,
        punchTime: punch.logDateTime,
        processingStage: 'ATTLOGS_DETECTION',
        success: true,
        metadata: { status: existing.status },
      });
      return existing;
    }

    // Stage B (Checkpoint B4) — Pattern 2 (Oracle-derived). No local Postgres
    // join can resolve tenant here (A9's finding); stamp it now from the raw
    // ATTLOGS INTRABRANCHID, before roster resolution even runs. Currently
    // always resolves to the seeded 'default' tenant (no branch->tenant
    // mapping table exists yet — Phase 10 provisioning), matching what A9's
    // backfill already put in every pre-existing row.
    const tenantId = await this.oracleTenantResolver.resolveForBranch(punch.intraBranchId);

    const event = this.eventRepo.create({
      sourceId: punch.sourceId,
      idempotencyKey,
      employeeCode: punch.employeeCode,
      logDateTime: punch.logDateTime,
      deviceName: punch.deviceName,
      direction: punch.direction,
      rawDirection: punch.rawDirection,
      rawPayload: punch.raw,
      status: 'NEW',
      tenantId,
    });
    const saved = await this.eventRepo.save(event);
    this.attendanceLogger.info('ATTLOGS punch recorded', {
      employeeCode: punch.employeeCode,
      attlogId: punch.sourceId,
      punchDirection: punch.direction,
      punchTime: punch.logDateTime,
      processingStage: 'ATTLOGS_DETECTION',
      success: true,
    });
    return saved;
  }

  async getPunchesForWindow(employeeCode: string, from: Date, to: Date): Promise<AttendanceEvent[]> {
    return this.eventRepo.find({
      where: { employeeCode, logDateTime: Between(from, to) },
      order: { logDateTime: 'ASC' },
    });
  }

  async getSourcePunchesForWindow(employeeCode: string, from: Date, to: Date): Promise<AttendanceEvent[]> {
    const startedAt = this.attendanceLogger.time();
    if (!this.oracle.isAvailable) {
      const fallback = await this.getPunchesForWindow(employeeCode, from, to);
      this.attendanceLogger.warn('Oracle unavailable; using local attendance event history for recalculation', {
        employeeCode,
        processingStage: 'ORACLE_POLLING',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { from: from.toISOString(), to: to.toISOString(), punchCount: fallback.length },
      });
      return fallback;
    }

    try {
      const cfg = await this.attendanceConfig.getConfig();
      const table = this.attendanceConfig.ident(cfg, 'attendance.attlogs.table');
      const empCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.employeeCode');
      const dtCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.logDateTime');
      const deviceCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.deviceName');
      const directionCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.direction');
      const ipCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.ipAddress');
      const snCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.serialNumber');
      const branchCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.intraBranchId');
      const createdCol = this.attendanceConfig.ident(cfg, 'attendance.attlogs.createdAt');

      // NOTE: bind variables must not be named :from / :to — Oracle rejects
      // both with ORA-01745 ("invalid host/bind variable name") because TO
      // (and, in some contexts, FROM) is a reserved word, not a valid bind
      // identifier. Confirmed in production. Use :windowFrom / :windowTo.
      //
      // Also: LOGDATETIME is stored as VARCHAR2 ('DD-MM-YYYY HH24:MI:SS'),
      // so it must go through TO_DATE() before comparing against a JS Date
      // bind — comparing the raw string to a DATE bind would silently fall
      // back to a lexicographic string comparison via the session's
      // NLS_DATE_FORMAT, not a real date comparison. Same TO_DATE pattern
      // already used in oracle-polling.service.ts.
      const dtExpr = `TO_DATE(${dtCol}, 'DD-MM-YYYY HH24:MI:SS')`;
      const rows = await this.oracle.query<Record<string, unknown>>(
        `
        SELECT
          ${empCol} AS "employeeCode",
          ${dtExpr} AS "logDateTime",
          ${deviceCol} AS "deviceName",
          ${directionCol} AS "direction",
          ${ipCol} AS "ipAddress",
          ${snCol} AS "serialNumber",
          ${branchCol} AS "intraBranchId",
          ${createdCol} AS "createdAt"
        FROM ${table}
        WHERE ${empCol} = :employeeCode
          AND ${dtExpr} >= :windowFrom
          AND ${dtExpr} <= :windowTo
        ORDER BY ${dtExpr} ASC
        `,
        { employeeCode, windowFrom: from, windowTo: to },
      );

      const punches = rows
        .map((row) => this.mapSourceRow(row))
        .filter((event): event is AttendanceEvent => !!event);

      this.attendanceLogger.info('Loaded ATTLOGS punches for shift recalculation', {
        employeeCode,
        processingStage: 'ATTLOGS_DETECTION',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { from: from.toISOString(), to: to.toISOString(), punchCount: punches.length },
      });

      return punches;
    } catch (err) {
      this.attendanceLogger.error('Failed to load ATTLOGS punches for shift recalculation', {
        employeeCode,
        processingStage: 'ORACLE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        metadata: { from: from.toISOString(), to: to.toISOString() },
      }, err);
      throw err;
    }
  }

  toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private mapSourceRow(row: Record<string, unknown>): AttendanceEvent | null {
    const employeeCode = String(row.employeeCode ?? '').trim();
    const rawDate = row.logDateTime;
    if (!employeeCode || !rawDate) return null;

    const logDateTime = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
    if (Number.isNaN(logDateTime.getTime())) return null;
    const rawDirection = row.direction == null ? null : String(row.direction);
    const punch: AttlogPunch = {
      sourceId: '',
      employeeCode,
      logDateTime,
      deviceName: row.deviceName == null ? null : String(row.deviceName),
      direction: this.normalizeDirection(rawDirection),
      rawDirection,
      ipAddress: row.ipAddress == null ? null : String(row.ipAddress),
      serialNumber: row.serialNumber == null ? null : String(row.serialNumber),
      intraBranchId: row.intraBranchId == null ? null : String(row.intraBranchId),
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : null,
      raw: row,
    };
    punch.sourceId = this.makeSourceId(punch);

    return {
      sourceId: punch.sourceId,
      idempotencyKey: punch.sourceId,
      employeeCode: punch.employeeCode,
      logDateTime: punch.logDateTime,
      deviceName: punch.deviceName,
      direction: punch.direction,
      rawDirection: punch.rawDirection,
      rawPayload: punch.raw,
      status: 'NEW',
    } as AttendanceEvent;
  }

  private normalizeDirection(value: string | null): PunchDirection {
    const normalized = (value ?? '').trim().toUpperCase();
    if (['IN', 'I', '0', 'ENTRY'].includes(normalized)) return 'IN';
    if (['OUT', 'O', '1', 'EXIT'].includes(normalized)) return 'OUT';
    return 'UNKNOWN';
  }
}
