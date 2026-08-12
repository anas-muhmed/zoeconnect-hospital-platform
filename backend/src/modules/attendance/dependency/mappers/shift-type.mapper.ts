/**
 * Phase 2B — ShiftTypeMapper
 *
 * Converts a raw SHIFT_TYPE Oracle row (column-aliased by
 * ShiftTypeDependencyPoller's SQL query) into an
 * AttendanceDependencyChangedEvent with scope: 'CONFIG'.
 *
 * A shift type change is config-level: it potentially invalidates attendance
 * decisions for every employee that uses that shift, across any date.
 * There is no specific employeeCode or dutyDate — the recalculation engine
 * uses scope='CONFIG' together with the shiftId/shiftCode in the payload to
 * find and re-evaluate affected records.
 */

import { randomUUID } from 'crypto';
import { AttendanceDependencyChangedEvent } from '../../events/attendance-dependency-changed.event';

/** Normalised representation of one SHIFT_TYPE table row. */
export interface ShiftTypeRow {
  /** SHIFT_TYPE.ID — the primary key of the changed shift definition. */
  shiftId:          string | number | null;
  /** SHIFT_TYPE.CODE — human-readable shift identifier. */
  shiftCode:        string | null;
  /**
   * LASTMODIFIEDDATE — the change-detection cursor column.
   * Rows with null timestamps are skipped so the cursor never stalls.
   */
  lastModifiedDate: Date | null;
  /** Full raw row stored in the event payload for auditability. */
  raw:              Record<string, unknown>;
}

export class ShiftTypeMapper {
  /**
   * Maps a raw Oracle result row to a ShiftTypeRow.
   * Returns null when mandatory fields (lastModifiedDate) are absent.
   *
   * Column aliases expected from the poller SQL:
   *   "shiftId"          — ID
   *   "shiftCode"        — CODE
   *   "lastModifiedDate" — LASTMODIFIEDDATE (or configured attendance.shift.lastModifiedDate)
   */
  static mapRow(raw: Record<string, unknown>): ShiftTypeRow | null {
    const lastModifiedRaw = raw['lastModifiedDate'];
    if (!lastModifiedRaw) return null;

    const lastModifiedDate = lastModifiedRaw instanceof Date
      ? lastModifiedRaw
      : new Date(String(lastModifiedRaw));

    if (isNaN(lastModifiedDate.getTime())) return null;

    const shiftId = raw['shiftId'] != null ? (raw['shiftId'] as string | number) : null;
    const shiftCode = raw['shiftCode'] != null
      ? String(raw['shiftCode']).trim() || null
      : null;

    return { shiftId, shiftCode, lastModifiedDate, raw };
  }

  /**
   * Converts a ShiftTypeRow into an AttendanceDependencyChangedEvent.
   *
   * Key design decisions:
   *   • scope: 'CONFIG' — no employee or date targeted; recalculation engine
   *     must look up all attendance records for this shiftId/shiftCode.
   *   • employeeCode: null — always; shift definitions are global config.
   *   • dutyDate: null — always; a shift type change can affect any date.
   *   • shiftId + shiftCode are carried in the payload so Phase 3 can
   *     efficiently scope the recalculation to only affected employees/dates.
   */
  static toEvent(row: ShiftTypeRow): AttendanceDependencyChangedEvent {
    return new AttendanceDependencyChangedEvent({
      source:        'SHIFT_TYPE',
      scope:         'CONFIG',
      employeeCode:  null,
      dutyDate:      null,
      triggeredAt:   row.lastModifiedDate ?? new Date(),
      correlationId: randomUUID(),
      payload: {
        source:    'SHIFT_TYPE',
        shiftId:   row.shiftId,
        shiftCode: row.shiftCode,
        raw:       row.raw,
      },
    });
  }
}
