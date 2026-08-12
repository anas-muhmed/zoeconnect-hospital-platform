/**
 * Phase 2A — AttendanceDependencyPoller interface
 *
 * Every external-system change-detection poller (DutyPlan, Leave, Holiday, ShiftType …)
 * must implement this interface.  The DependencyPollingOrchestrator treats all pollers
 * identically, so adding a new dependency source in future phases requires only:
 *   1. Implementing AttendanceDependencyPoller
 *   2. Registering the new class in AttendanceModule
 *
 * Architectural constraints (Master Task):
 *   • External systems polled ONLY.  Internal components MUST NEVER poll.
 *   • Each poller is independent — one failure must not affect others.
 *   • Cursor is timestamp-based (never ROWID) for tables that actually carry
 *     a modification timestamp column (e.g. HOLIDAY).
 *   • Exception: DUTYPLANVALUES and EMPLOYEELEAVELIST have no modification-
 *     timestamp column in the HIS Oracle schema (confirmed by production
 *     ORA-00904 on both), so DutyPlanDependencyPoller and LeaveDependencyPoller
 *     do not use an incremental cursor at all — each re-scans a rolling date
 *     window (PLANDATE, and FROMDATE/TODATE respectively) every cycle. Their
 *     `cursor` metric/resetCursor() instead represent the floor (earliest
 *     date) of that window. See duty-plan-dependency.poller.ts and
 *     leave-dependency.poller.ts.
 */

export interface PollerMetrics {
  /** Whether this poller is enabled via its individual feature flag. */
  enabled:             boolean;
  /** Whether a poll() call is currently executing. */
  running:             boolean;
  /** Timestamp of the most recent poll() invocation (success or failure). */
  lastPollAt:          Date | null;
  /** Timestamp of the most recent successful poll(). */
  lastSuccessAt:       Date | null;
  /** Number of Oracle rows returned in the most recent poll(). */
  rowsLastPoll:        number;
  /** Running total of AttendanceDependencyChangedEvents emitted since startup. */
  eventsEmittedTotal:  number;
  /** Running total of poll() failures since startup. */
  errorsTotal:         number;
  /** Error message from the most recent failed poll(), or null. */
  lastError:           string | null;
  /** Current cursor value (ISO-8601 timestamp string), or null if not yet initialised. */
  cursor:              string | null;
}

export interface AttendanceDependencyPoller {
  /** Human-readable name used in logs and monitoring output. */
  readonly name: string;

  /**
   * Execute one polling cycle:
   *   1. Check feature flag — return immediately if disabled.
   *   2. Check Oracle availability — log + return if unavailable.
   *   3. Read the cursor (or, for DutyPlan/Leave, the refresh window floor)
   *      from Redis.
   *   4. Query Oracle for changed rows: rows modified after the cursor for
   *      timestamp-backed tables, or all rows within the current date window
   *      for DutyPlan/Leave (neither has a modification timestamp).
   *   5. Map each row via its Mapper → AttendanceDependencyChangedEvent.
   *   6. Route each event via DependencyEventRouter.route().
   *   7. Advance the cursor to the latest seen timestamp + 1 ms (timestamp
   *      pollers only — DutyPlan/Leave's window floors do not auto-advance).
   *   8. Update internal PollerMetrics.
   *
   * Must NEVER throw — all errors are caught, logged, and reflected in metrics.
   */
  poll(): Promise<void>;

  /** Returns a snapshot of internal metrics (no async I/O). */
  getMetrics(): PollerMetrics;

  /** Resets the Redis cursor to the given date (used by admin endpoints). */
  resetCursor(date: Date): Promise<void>;
}
