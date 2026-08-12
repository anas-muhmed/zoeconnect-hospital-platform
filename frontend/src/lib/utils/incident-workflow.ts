import { IncidentTimelineEvent } from '../../types/incident.types';

/**
 * Single source of truth for the incident lifecycle's linear display order
 * and human-readable copy. Mirrors backend/src/modules/incident/incidents/
 * incident-workflow.service.ts's TRANSITIONS map, but flattened into the
 * order stages normally occur in (that service only encodes *legal*
 * transitions, not a fixed sequence, since several stages can be skipped).
 *
 * TRIAGE and CONTAINMENT are marked optional: mandatory for Critical/High
 * severity, skippable otherwise (see TriageTabContent in the incident
 * detail page for the severity check).
 */
export interface WorkflowStepDef {
  key: string;
  label: string;
  optional?: boolean;
}

export const INCIDENT_WORKFLOW_STEPS: WorkflowStepDef[] = [
  { key: 'DRAFT', label: 'Reported' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'TRIAGE', label: 'Triage', optional: true },
  { key: 'CONTAINMENT', label: 'Containment', optional: true },
  { key: 'INVESTIGATION', label: 'Investigation' },
  { key: 'RCA_PENDING', label: 'Root Cause Analysis' },
  { key: 'CAPA_PENDING', label: 'Corrective Actions' },
  { key: 'VERIFICATION', label: 'Verification' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'ARCHIVED', label: 'Archived' },
];

export type WorkflowStepState = 'completed' | 'current' | 'skipped' | 'pending';

export interface WorkflowStepView extends WorkflowStepDef {
  state: WorkflowStepState;
}

/**
 * Derives a per-step state for display, using the incident's current status
 * plus its timeline history (STATUS_CHANGED events carry the target status
 * in `metadata.targetStatus` -- see IncidentService.transition()) to tell
 * "skipped because this incident's path never went through it" apart from
 * "actually completed, just not the current stage".
 */
export function deriveWorkflowStepStates(
  status: string,
  timelineEvents: IncidentTimelineEvent[] = [],
): WorkflowStepView[] {
  const order = INCIDENT_WORKFLOW_STEPS.map((s) => s.key);
  const currentIndex = order.indexOf(status);

  const reached = new Set<string>(['DRAFT']);
  for (const event of timelineEvents) {
    if (event.eventType === 'STATUS_CHANGED') {
      const target = (event.metadata as Record<string, unknown> | undefined)?.['targetStatus'];
      if (typeof target === 'string') reached.add(target);
    }
  }
  reached.add(status);

  return INCIDENT_WORKFLOW_STEPS.map((step, i) => {
    let state: WorkflowStepState;
    if (step.key === status) {
      state = 'current';
    } else if (reached.has(step.key)) {
      state = 'completed';
    } else if (currentIndex >= 0 && i < currentIndex) {
      state = 'skipped';
    } else {
      state = 'pending';
    }
    return { ...step, state };
  });
}

/**
 * Human copy describing what needs to happen next, given the incident's
 * current status. Used both in the workflow status widget and appended to
 * success toasts after a transition, so the person acting on the incident
 * always knows what's next without having to guess from the tab bar.
 */
export function getNextStepMessage(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Submit the incident for review.';
    case 'SUBMITTED':
      return 'Acknowledge the incident.';
    case 'ACKNOWLEDGED':
      return 'Assign an investigator.';
    case 'ASSIGNED':
      return 'Complete Triage (required for Critical/High severity) or start the Investigation directly.';
    case 'TRIAGE':
      return 'Begin Containment if required, or start the Investigation.';
    case 'CONTAINMENT':
      return 'Start the Investigation once containment measures are in place.';
    case 'INVESTIGATION':
      return 'Record findings and mark the investigation completed to begin Root Cause Analysis.';
    case 'RCA_PENDING':
      return 'Complete the Root Cause Analysis (5 Whys / Fishbone) with a confirmed root cause.';
    case 'CAPA_PENDING':
      return 'Add Corrective/Preventive Actions and mark each completed.';
    case 'VERIFICATION':
      return 'Verify each completed CAPA, then close the incident.';
    case 'CLOSED':
      return 'No action required. The incident can be archived or reopened if needed.';
    case 'ARCHIVED':
      return 'No further action — this incident is archived.';
    default:
      return 'Continue the workflow from the relevant tab.';
  }
}
