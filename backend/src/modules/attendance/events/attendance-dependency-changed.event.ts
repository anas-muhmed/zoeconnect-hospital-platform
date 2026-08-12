/**
 * AttendanceDependencyChangedEvent
 *
 * The ONE generic event emitted whenever an external system that attendance
 * decisions depend on changes:
 *   DUTY_PLAN  -- a roster/duty-plan row was created, updated, or deleted
 *   LEAVE      -- an approved leave record changed
 *   HOLIDAY    -- the holiday calendar was updated
 *   SHIFT_TYPE -- a shift definition changed
 *
 * Architectural constraints (Master Task):
 *   - External systems are polled only.
 *   - This event is emitted BY the poller services when they detect a change.
 *   - Provisional states are NEVER written to Oracle HIS tables.
 *   - DUTY_PLAN changes must be debounced before triggering recalculation.
 *   - This event class is a plain value object -- no NestJS decorators.
 */

export type DependencySource = 'DUTY_PLAN' | 'LEAVE' | 'HOLIDAY' | 'SHIFT_TYPE';

/**
 * Scope classifies the blast radius of a dependency change so the future
 * recalculation engine can batch work intelligently:
 *
 *   EMPLOYEE -- change affects one specific employee on one date (DutyPlan, Leave)
 *   GLOBAL   -- change affects ALL employees on a specific date (Holiday)
 *   CONFIG   -- change affects ALL employees across all dates (ShiftType definition)
 */
export type DependencyEventScope = 'EMPLOYEE' | 'GLOBAL' | 'CONFIG';

export class AttendanceDependencyChangedEvent {
  readonly source: DependencySource;

  /**
   * Blast-radius scope of this change.
   * Defaults to 'EMPLOYEE' for backward compatibility.
   */
  readonly scope: DependencyEventScope;

  readonly employeeCode: string | null;
  readonly dutyDate: Date | null;
  readonly triggeredAt: Date;
  readonly correlationId: string;
  readonly payload: Record<string, unknown>;

  constructor(init: {
    source: DependencySource;
    scope?: DependencyEventScope;
    employeeCode: string | null;
    dutyDate: Date | null;
    triggeredAt: Date;
    correlationId: string;
    payload: Record<string, unknown>;
  }) {
    this.source        = init.source;
    this.scope         = init.scope ?? 'EMPLOYEE';
    this.employeeCode  = init.employeeCode;
    this.dutyDate      = init.dutyDate;
    this.triggeredAt   = init.triggeredAt;
    this.correlationId = init.correlationId;
    this.payload       = init.payload;
  }
}
