/**
 * Phase 2B — HolidayMapper
 *
 * Converts a raw HOLIDAY Oracle row (column-aliased by HolidayDependencyPoller's
 * SQL query) into an AttendanceDependencyChangedEvent with scope: 'GLOBAL'.
 *
 * A holiday change affects ALL employees on that date — there is no
 * employeeCode.  The recalculation engine uses scope='GLOBAL' to fan the
 * work out to every employee scheduled on dutyDate.
 */

import { randomUUID } from 'crypto';
import { AttendanceDependencyChangedEvent } from '../../events/attendance-dependency-changed.event';

/** Normalised representation of one HOLIDAY table row. */
export interface HolidayRow {
  /**
   * HOLDATE (or configured override) — the calendar date of the holiday.
   * This becomes dutyDate on the emitted event so the recalculation engine
   * can target all employees on that day.
   */
  holidayDate:      Date | null;
  /**
   * LASTMODIFIEDDATE — the change-detection cursor column.
   * Rows with null timestamps are skipped so the cursor never stalls.
   */
  lastModifiedDate: Date | null;
  /** Full raw row stored in the event payload for auditability. */
  raw:              Record<string, unknown>;
}

export class HolidayMapper {
  /**
   * Maps a raw Oracle result row to a HolidayRow.
   * Returns null when mandatory fields (lastModifiedDate) are absent.
   *
   * Column aliases expected from the poller SQL:
   *   "holidayDate"      — HOLDATE (or configured attendance.holiday.date)
   *   "lastModifiedDate" — LASTMODIFIEDDATE (or configured attendance.holiday.lastModifiedDate)
   */
  static mapRow(raw: Record<string, unknown>): HolidayRow | null {
    const lastModifiedRaw = raw['lastModifiedDate'];
    if (!lastModifiedRaw) return null;

    const lastModifiedDate = lastModifiedRaw instanceof Date
      ? lastModifiedRaw
      : new Date(String(lastModifiedRaw));

    if (isNaN(lastModifiedDate.getTime())) return null;

    const holidayDateRaw = raw['holidayDate'];
    const holidayDate = holidayDateRaw != null
      ? (holidayDateRaw instanceof Date ? holidayDateRaw : new Date(String(holidayDateRaw)))
      : null;

    return { holidayDate, lastModifiedDate, raw };
  }

  /**
   * Converts a HolidayRow into an AttendanceDependencyChangedEvent.
   *
   * Key design decisions:
   *   • scope: 'GLOBAL' — no employee targeted; recalculation engine fans out.
   *   • employeeCode: null — always; the holiday calendar is not per-employee.
   *   • dutyDate: the holiday date — the one day all employees are affected.
   */
  static toEvent(row: HolidayRow): AttendanceDependencyChangedEvent {
    return new AttendanceDependencyChangedEvent({
      source:        'HOLIDAY',
      scope:         'GLOBAL',
      employeeCode:  null,
      dutyDate:      row.holidayDate,
      triggeredAt:   row.lastModifiedDate ?? new Date(),
      correlationId: randomUUID(),
      payload: {
        source:      'HOLIDAY',
        holidayDate: row.holidayDate?.toISOString() ?? null,
        raw:         row.raw,
      },
    });
  }
}
