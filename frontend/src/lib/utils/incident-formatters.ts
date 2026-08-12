import { IncidentStatus, ActionStatus, VerificationOutcome } from '../../types/incident.types';

export const getStatusLabel = (status: IncidentStatus): string => {
  const map: Record<IncidentStatus, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    ACKNOWLEDGED: 'Acknowledged',
    ASSIGNED: 'Assigned',
    CONTAINMENT: 'Containment',
    INVESTIGATION: 'Investigation',
    RCA_PENDING: 'RCA Pending',
    CAPA_PENDING: 'CAPA Pending',
    VERIFICATION: 'Verification',
    CLOSED: 'Closed',
    ARCHIVED: 'Archived',
  };
  return map[status] || status;
};

export const getStatusColor = (status: IncidentStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'DRAFT': return 'default';
    case 'SUBMITTED': return 'info';
    case 'ACKNOWLEDGED': return 'secondary';
    case 'ASSIGNED': return 'primary';
    case 'CONTAINMENT': return 'warning';
    case 'INVESTIGATION': return 'warning';
    case 'RCA_PENDING': return 'error';
    case 'CAPA_PENDING': return 'error';
    case 'VERIFICATION': return 'info';
    case 'CLOSED': return 'success';
    case 'ARCHIVED': return 'default';
    default: return 'default';
  }
};

export const getActionStatusLabel = (status: ActionStatus): string => {
  const map: Record<ActionStatus, string> = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected',
    REOPENED: 'Reopened',
  };
  return map[status] || status;
};

export const getActionStatusColor = (status: ActionStatus): 'default' | 'primary' | 'error' | 'success' | 'warning' => {
  switch (status) {
    case 'PENDING': return 'default';
    case 'IN_PROGRESS': return 'primary';
    case 'COMPLETED': return 'success';
    case 'REJECTED': return 'error';
    case 'REOPENED': return 'warning';
    default: return 'default';
  }
};

export const getVerificationOutcomeLabel = (outcome: VerificationOutcome): string => {
  const map: Record<VerificationOutcome, string> = {
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    NEED_MORE_EVIDENCE: 'Needs More Evidence',
  };
  return map[outcome] || outcome;
};

export const getVerificationOutcomeColor = (outcome: VerificationOutcome): 'success' | 'error' | 'warning' => {
  switch (outcome) {
    case 'APPROVED': return 'success';
    case 'REJECTED': return 'error';
    case 'NEED_MORE_EVIDENCE': return 'warning';
    default: return 'warning';
  }
};
