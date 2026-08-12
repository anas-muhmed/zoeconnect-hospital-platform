import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * IncidentWorkflowService — server-side state machine for incident status transitions.
 *
 * All transitions must pass through this service. Direct status writes
 * without calling validateTransition() are a code smell and should be
 * caught in code review.
 *
 * Lifecycle:
 *   DRAFT → SUBMITTED → ACKNOWLEDGED → ASSIGNED → TRIAGE →
 *   CONTAINMENT → INVESTIGATION → RCA_PENDING → CAPA_PENDING →
 *   VERIFICATION → CLOSED → ARCHIVED
 *
 * Reverse paths:
 *   VERIFICATION → CAPA_PENDING  (CAPA rejected by quality team)
 *   CLOSED → INVESTIGATION       (controlled reopen, requires INCIDENTS:CLOSE permission)
 *
 * The TRIAGE and CONTAINMENT stages are inserted between ASSIGNED and
 * INVESTIGATION following user directive #3. They are mandatory for
 * Critical and High severity incidents; optional for others (the workflow
 * allows jumping ASSIGNED → INVESTIGATION for Low/Moderate if configured).
 */
@Injectable()
export class IncidentWorkflowService {
  /** Allowed transitions: key = current status, value = allowed next statuses */
  private static readonly TRANSITIONS: Record<string, string[]> = {
    DRAFT:          ['SUBMITTED'],
    SUBMITTED:      ['ACKNOWLEDGED', 'DRAFT'],
    ACKNOWLEDGED:   ['ASSIGNED', 'SUBMITTED'],
    ASSIGNED:       ['TRIAGE', 'INVESTIGATION', 'ACKNOWLEDGED'],
    TRIAGE:         ['CONTAINMENT', 'INVESTIGATION', 'ASSIGNED'],
    CONTAINMENT:    ['INVESTIGATION', 'TRIAGE'],
    INVESTIGATION:  ['RCA_PENDING', 'CAPA_PENDING', 'ASSIGNED'],
    RCA_PENDING:    ['CAPA_PENDING', 'INVESTIGATION'],
    CAPA_PENDING:   ['VERIFICATION', 'RCA_PENDING'],
    VERIFICATION:   ['CLOSED', 'CAPA_PENDING'],   // CAPA_PENDING = quality rejected
    CLOSED:         ['ARCHIVED', 'INVESTIGATION'], // INVESTIGATION = controlled reopen
    ARCHIVED:       [],                            // terminal state
  };

  validateTransition(currentStatus: string, targetStatus: string): void {
    const allowed = IncidentWorkflowService.TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${targetStatus}. ` +
        `Allowed: [${allowed.join(', ') || 'none'}]`,
      );
    }
  }

  getAllowedTransitions(currentStatus: string): string[] {
    return IncidentWorkflowService.TRANSITIONS[currentStatus] ?? [];
  }

  isTerminal(status: string): boolean {
    return status === 'ARCHIVED';
  }

  isClosed(status: string): boolean {
    return status === 'CLOSED' || status === 'ARCHIVED';
  }

  /** Returns human-readable stage label for the current status */
  stageLabel(status: string): string {
    const labels: Record<string, string> = {
      DRAFT: 'Reporting',
      SUBMITTED: 'Submitted',
      ACKNOWLEDGED: 'Acknowledged',
      ASSIGNED: 'Assigned',
      TRIAGE: 'Triage',
      CONTAINMENT: 'Containment',
      INVESTIGATION: 'Investigation',
      RCA_PENDING: 'Root Cause Analysis',
      CAPA_PENDING: 'Corrective Actions',
      VERIFICATION: 'Verification',
      CLOSED: 'Closed',
      ARCHIVED: 'Archived',
    };
    return labels[status] ?? status;
  }
}
