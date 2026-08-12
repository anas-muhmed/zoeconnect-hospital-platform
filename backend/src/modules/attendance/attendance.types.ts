export type PunchDirection = 'IN' | 'OUT' | 'UNKNOWN';

export type AttendanceEventStatus =
  | 'NEW'
  | 'QUEUED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'SKIPPED'
  | 'FAILED'
  | 'DEAD_LETTER';

export type AttendanceDecisionStatus =
  | 'PRESENT'
  | 'MISS_PUNCH'
  | 'MISSING_IN'
  | 'MISSING_OUT'
  | 'NPNL'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'LATE_COMING'
  | 'EARLY_GOING'
  | 'HALF_DAY'
  | 'INVALID'
  | 'NO_ROSTER'
  | 'INELIGIBLE';

export type AttendanceProcessingMode = 'REALTIME' | 'RECONCILIATION' | 'MANUAL_RETRY' | 'DEPENDENCY_RECALC' | 'RETROACTIVE' | 'NPNL_SWEEP';

export type SkipReason =
  | 'PAYROLL_LOCKED'
  | 'MANUAL_OVERRIDE'
  | 'ALREADY_UP_TO_DATE'
  | 'INVALID_DEPENDENCY'
  | 'DUPLICATE_EVENT';

export type LockScope = 'EMPLOYEE' | 'DEPARTMENT' | 'ALL';
export type LeavePunchBehaviour = 'TREAT_AS_LEAVE' | 'TREAT_AS_WORKED_SHIFT' | 'MANUAL_APPROVAL' | 'CUSTOM_RULE';
export type NonWorkingDayPunchBehaviour = 'KEEP_NON_WORKING_DAY' | 'TREAT_AS_WORKED_SHIFT' | 'TREAT_AS_OVERTIME' | 'CUSTOM_RULE';
export type LeaveDayPart = 'FULL_DAY' | 'MORNING_HALF' | 'AFTERNOON_HALF';

export interface AttlogPunch {
  sourceId: string;
  employeeCode: string;
  logDateTime: Date;
  deviceName: string | null;
  direction: PunchDirection;
  rawDirection: string | null;
  ipAddress: string | null;
  serialNumber: string | null;
  intraBranchId: string | null;
  createdAt: Date | null;
  raw: Record<string, unknown>;
}

export interface RosterContext {
  employeeCode: string;
  employeeId: number | null;
  dutyDate: Date;
  rosterId: string | null;
  shiftCode: string | null;
  primaryShiftId: number | null;
  secondShiftId: number | null;
  plannedIn: Date | null;
  plannedOut: Date | null;
  secondPlannedIn: Date | null;
  secondPlannedOut: Date | null;
  plannedStatus: string | null;
  actualStatus: string | null;
  approvedLeaveType: string | null;
  approvedLeaveDayPart: LeaveDayPart | null;
  isHoliday: boolean;
  isWeekOff: boolean;
  isResigned: boolean;
  isNight: boolean;
  isWorkShift: boolean;
  intraBranchId: number | null;
  raw: Record<string, unknown> | null;
  /**
   * Eligibility gate sourced from EMPLOYEE / PMS_EMPLOYEE / EMPLOYEESCMAPFORDUTYROSTER,
   * confirmed 2026-07 by the user against production Oracle. An employee is
   * eligible for punch tracking only if ALL of:
   *   - EMPLOYEE.ISPUNCHREQUIRED = 1
   *   - EMPLOYEE.EMP_STATUS is the configured "active" value (default '75')
   *   - PMS_EMPLOYEE.RELIEVINGDATE is null OR the duty date is on/before it
   *     (the relieving date itself still counts; exclusion starts the day after)
   *   - the employee has a currently-ACTIVE row in EMPLOYEESCMAPFORDUTYROSTER
   *     (ISACTIVE = 1) — i.e. is mapped to a servicecenter right now
   * See roster-resolver.service.ts for the query and ineligibleReason for
   * which specific condition failed.
   */
  isEligibleForPunch: boolean;
  /** Human-readable reason isEligibleForPunch is false; null when eligible. */
  ineligibleReason: string | null;
  /**
   * EMPLOYEE.PUNCH: 1 = a single IN or OUT punch is sufficient to mark
   * PRESENT for this employee; 2 (or unset) = both IN and OUT are required
   * (the normal two-punch flow). Distinct from the shift/rule-level
   * allowSinglePunchAsPresent — this is set per-employee by HR on the
   * employee master, not a global/shift rule.
   */
  punchesRequired: 1 | 2;
  /**
   * The employee's CURRENT active EMPLOYEESCMAPFORDUTYROSTER.SERVICECENTER
   * value. NOT the same dimension as intraBranchId (DUTYROSTERMASTER has
   * both SERVICECENTER and INTRABRANCHID as distinct columns) — this is
   * used only to (a) determine eligibility and (b) scope which
   * DUTYPLANVALUES row belongs to the employee's current servicecenter
   * assignment when resolving their roster (see roster-resolver.service.ts).
   * It does NOT replace intraBranchId for DUTYACTUALVALUES/shift-lookup
   * purposes.
   */
  activeServiceCenterId: number | null;
}

export interface AttendanceDecision {
  status: AttendanceDecisionStatus;
  inPunch: Date | null;
  outPunch: Date | null;
  lateMinutes: number;
  earlyGoingMinutes: number;
  workMinutes: number;
  reasonCode: string;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresManualReview: boolean;
  actualShiftCode: string | null;
  ruleSnapshot: Record<string, unknown>;
  punchCount: number;
}

export interface AttendanceRuleSet {
  duplicateWindowSeconds: number;
  earlyGraceMinutes: number;
  lateGraceMinutes: number;
  earlyGoingGraceMinutes: number;
  minimumWorkMinutesForPresent: number;
  minimumWorkMinutesForHalfDay: number;
  maxFuturePunchMinutes: number;
  maxBackdatedPunchDays: number;
  nightShiftOutGraceHours: number;
  defaultShiftHours: number;
  allowSinglePunchAsPresent: boolean;
  lateEarlyPenaltyShiftCode: string | null;
  leavePunchBehaviour: LeavePunchBehaviour;
  weekOffPunchBehaviour: NonWorkingDayPunchBehaviour;
  holidayPunchBehaviour: NonWorkingDayPunchBehaviour;
}
