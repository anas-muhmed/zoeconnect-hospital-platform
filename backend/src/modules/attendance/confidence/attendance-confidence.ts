/**
 * AttendanceConfidence — ZoeConnect-internal confidence model
 *
 * Tracks how reliable an attendance decision is given the current state of all
 * dependencies (punches, roster, leave, holidays, shift definitions).
 *
 * Architectural constraints (Master Task):
 *   • Confidence is ZoeConnect-internal ONLY — never written to Oracle HIS tables.
 *   • A LOCKED record must not be overwritten by any automated dependency event.
 *   • Only PROVISIONAL records are eligible for automatic recalculation when
 *     a dependency changes.
 *
 * Lifecycle:
 *   PROVISIONAL → HIGH → FINAL → LOCKED
 *
 *   PROVISIONAL  All dependencies were not yet resolvable at decision time
 *                (e.g. out-punch not yet arrived, leave still pending).
 *
 *   HIGH         All known dependencies resolved; decision is reliable but
 *                still subject to change if a dependency event arrives for
 *                a past date.
 *
 *   FINAL        Night-reconciliation has run and the shift window is closed;
 *                the record will not be automatically re-evaluated.
 *
 *   LOCKED       An administrator has manually reviewed and locked the record.
 *                Automated processes must not alter a LOCKED record.
 */

export type AttendanceConfidenceLevel = 'PROVISIONAL' | 'HIGH' | 'FINAL' | 'LOCKED';

/**
 * Immutable value object representing the confidence level of a single
 * attendance decision together with the reason it was assigned that level.
 */
export class AttendanceConfidence {
  readonly level: AttendanceConfidenceLevel;
  readonly reason: string;
  readonly computedAt: Date;

  constructor(level: AttendanceConfidenceLevel, reason: string, computedAt: Date = new Date()) {
    this.level      = level;
    this.reason     = reason;
    this.computedAt = computedAt;
  }

  // ── Predicate helpers ──────────────────────────────────────────────────────

  /** True when automated recalculation triggered by a dependency event is allowed. */
  isRecalculable(): boolean {
    return this.level === 'PROVISIONAL' || this.level === 'HIGH';
  }

  /** True when the record is provisional — highest recalculation priority. */
  isProvisional(): boolean {
    return this.level === 'PROVISIONAL';
  }

  /** True when no automated process may overwrite this record. */
  isLocked(): boolean {
    return this.level === 'LOCKED';
  }

  /** True when the shift window is closed and nightly reconciliation has run. */
  isFinal(): boolean {
    return this.level === 'FINAL';
  }

  // ── Transition helpers ─────────────────────────────────────────────────────

  /**
   * Attempt to advance the confidence level.
   * Returns a new AttendanceConfidence; does NOT mutate this instance.
   * Throws if the requested transition is illegal.
   */
  transitionTo(
    next: AttendanceConfidenceLevel,
    reason: string,
  ): AttendanceConfidence {
    AttendanceConfidence.assertTransitionAllowed(this.level, next);
    return new AttendanceConfidence(next, reason);
  }

  /**
   * Legal transitions:
   *   PROVISIONAL → HIGH | FINAL | LOCKED
   *   HIGH        → FINAL | LOCKED
   *   FINAL       → LOCKED
   *   LOCKED      → (none — immutable)
   */
  static assertTransitionAllowed(
    from: AttendanceConfidenceLevel,
    to: AttendanceConfidenceLevel,
  ): void {
    const allowed: Record<AttendanceConfidenceLevel, AttendanceConfidenceLevel[]> = {
      PROVISIONAL: ['HIGH', 'FINAL', 'LOCKED'],
      HIGH:        ['FINAL', 'LOCKED'],
      FINAL:       ['LOCKED'],
      LOCKED:      [],
    };
    if (!allowed[from].includes(to)) {
      throw new Error(
        `Illegal AttendanceConfidence transition: ${from} → ${to}`,
      );
    }
  }

  // ── Factory helpers ────────────────────────────────────────────────────────

  static provisional(reason: string): AttendanceConfidence {
    return new AttendanceConfidence('PROVISIONAL', reason);
  }

  static high(reason: string): AttendanceConfidence {
    return new AttendanceConfidence('HIGH', reason);
  }

  static final(reason: string): AttendanceConfidence {
    return new AttendanceConfidence('FINAL', reason);
  }

  static locked(reason: string): AttendanceConfidence {
    return new AttendanceConfidence('LOCKED', reason);
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): { level: AttendanceConfidenceLevel; reason: string; computedAt: string } {
    return {
      level:       this.level,
      reason:      this.reason,
      computedAt:  this.computedAt.toISOString(),
    };
  }

  static fromJSON(raw: {
    level: AttendanceConfidenceLevel;
    reason: string;
    computedAt: string;
  }): AttendanceConfidence {
    return new AttendanceConfidence(raw.level, raw.reason, new Date(raw.computedAt));
  }
}
