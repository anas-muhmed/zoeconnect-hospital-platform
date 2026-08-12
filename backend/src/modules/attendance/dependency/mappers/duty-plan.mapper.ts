/**
 * Phase 2A -- DutyPlanMapper
 *
 * Converts a raw DUTYPLANVALUES Oracle row into an AttendanceDependencyChangedEvent.
 * scope: 'EMPLOYEE' -- affects one specific employee on one date.
 *
 * DUTYPLANVALUES has NO modification-timestamp column in the HIS Oracle
 * schema (there is no LASTMODIFIEDDATE), so rows carry no signal for "this
 * changed since I last looked." DutyPlanDependencyPoller instead re-scans a
 * rolling PLANDATE window on every cycle and treats every row it sees as
 * "still current, make sure downstream recalculation reflects it." The
 * event's triggeredAt is therefore the poll time, not a per-row timestamp.
 */

import { randomUUID } from 'crypto';
import { AttendanceDependencyChangedEvent } from '../../events/attendance-dependency-changed.event';

export interface DutyPlanRow {
  employeeCode: string | null;
  dutyDate:     Date | null;
  raw:          Record<string, unknown>;
}

export class DutyPlanMapper {
  /**
   * Maps a raw row keyed by PLANDATE. Returns null when dutyDate is missing
   * or unparseable -- there is no timestamp fallback to fall back on.
   */
  static mapRow(raw: Record<string, unknown>): DutyPlanRow | null {
    const dutyDateRaw = raw['dutyDate'];
    if (dutyDateRaw == null) return null;

    const dutyDate = dutyDateRaw instanceof Date
      ? dutyDateRaw
      : new Date(String(dutyDateRaw));

    if (isNaN(dutyDate.getTime())) return null;

    const employeeCode = raw['employeeCode'] != null
      ? String(raw['employeeCode']).trim() || null
      : null;

    return { employeeCode, dutyDate, raw };
  }

  /**
   * @param triggeredAt Poll time -- this stands in for a per-row modification
   *   timestamp, which DUTYPLANVALUES does not have.
   */
  static toEvent(row: DutyPlanRow, triggeredAt: Date = new Date()): AttendanceDependencyChangedEvent {
    return new AttendanceDependencyChangedEvent({
      source:        'DUTY_PLAN',
      scope:         'EMPLOYEE',
      employeeCode:  row.employeeCode,
      dutyDate:      row.dutyDate,
      triggeredAt,
      correlationId: randomUUID(),
      payload: {
        source:   'DUTYPLANVALUES',
        dutyDate: row.dutyDate?.toISOString() ?? null,
        raw:      row.raw,
      },
    });
  }
}
