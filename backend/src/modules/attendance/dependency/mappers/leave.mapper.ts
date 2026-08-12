/**
 * Phase 2A -- LeaveMapper
 *
 * Converts a raw EMPLOYEELEAVELIST Oracle row into an AttendanceDependencyChangedEvent.
 * scope: 'EMPLOYEE' -- affects one specific employee on one date.
 *
 * EMPLOYEELEAVELIST has NO modification-timestamp column in the HIS Oracle
 * schema (there is no LASTMODIFIEDDATE, confirmed by ORA-00904 in
 * production), so rows carry no signal for "this changed since I last
 * looked." LeaveDependencyPoller instead re-scans a rolling FROMDATE/TODATE
 * window on every cycle and treats every row it sees as "still current,
 * make sure downstream recalculation reflects it." The event's triggeredAt
 * is therefore the poll time, not a per-row timestamp.
 */

import { randomUUID } from 'crypto';
import { AttendanceDependencyChangedEvent } from '../../events/attendance-dependency-changed.event';

export interface LeaveRow {
  employeeCode: string | null;
  leaveDate:    Date | null;
  raw:          Record<string, unknown>;
}

export class LeaveMapper {
  /**
   * Maps a raw row keyed by FROMDATE. Returns null when leaveDate is missing
   * or unparseable -- there is no timestamp fallback to fall back on.
   */
  static mapRow(raw: Record<string, unknown>): LeaveRow | null {
    const leaveDateRaw = raw['leaveDate'];
    if (leaveDateRaw == null) return null;

    const leaveDate = leaveDateRaw instanceof Date
      ? leaveDateRaw
      : new Date(String(leaveDateRaw));

    if (isNaN(leaveDate.getTime())) return null;

    const employeeCode = raw['employeeCode'] != null
      ? String(raw['employeeCode']).trim() || null
      : null;

    return { employeeCode, leaveDate, raw };
  }

  /**
   * @param triggeredAt Poll time -- this stands in for a per-row modification
   *   timestamp, which EMPLOYEELEAVELIST does not have.
   */
  static toEvent(row: LeaveRow, triggeredAt: Date = new Date()): AttendanceDependencyChangedEvent {
    return new AttendanceDependencyChangedEvent({
      source:        'LEAVE',
      scope:         'EMPLOYEE',
      employeeCode:  row.employeeCode,
      dutyDate:      row.leaveDate,
      triggeredAt,
      correlationId: randomUUID(),
      payload: {
        source:    'EMPLOYEELEAVELIST',
        leaveDate: row.leaveDate?.toISOString() ?? null,
        raw:       row.raw,
      },
    });
  }
}
