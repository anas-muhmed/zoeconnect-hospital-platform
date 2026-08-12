export type IncidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'CONTAINMENT'
  | 'INVESTIGATION'
  | 'RCA_PENDING'
  | 'CAPA_PENDING'
  | 'VERIFICATION'
  | 'CLOSED'
  | 'ARCHIVED';

export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'REOPENED';
export type VerificationOutcome = 'APPROVED' | 'REJECTED' | 'NEED_MORE_EVIDENCE';
export type CommentVisibility = 'PUBLIC' | 'INTERNAL';

export interface IncidentCategory {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface IncidentType {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface IncidentSeverityLevel {
  id: string;
  name: string;
  code: string;
  color: string;
  slaResponseHours?: number | null;
  slaInvestigationHours?: number | null;
  slaCapaDays?: number | null;
  slaClosureDays?: number | null;
  notifyRoles: string[];
  displayOrder: number;
  isActive: boolean;
}

export interface IncidentRiskMatrixConfig {
  id: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  riskLevel: string;
  color: string;
}

/**
 * IncidentNotificationRole — an incident-module-scoped notification target
 * (e.g. "RISK_MANAGER"), distinct from platform RBAC roles. This is what
 * `notifyRoles` on severities/rules actually references and what "Role
 * Assignments" in Incident Settings manages.
 */
export interface IncidentNotificationRole {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  /** How many users are currently mapped to this role. */
  memberCount?: number;
}

export interface IncidentNotificationRoleMember {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
}

export interface IncidentNotificationRule {
  id: string;
  name: string;
  description?: string | null;
  triggerEvent: string;
  conditions: Array<{ field: string; op: string; value: unknown }>;
  notifyRoles: string[];
  notifyUserIds: string[];
  channel: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentAttachment {
  id: string;
  incidentId: string;
  parentType: string;
  parentId: string;
  storageKey: string;
  thumbnailKey?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  attachmentType: 'image' | 'document' | 'audio' | 'video';
  uploadedById: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  incidentNumber: string;
  status: IncidentStatus;
  categoryId: string;
  category?: { name: string; code: string };
  typeId: string;
  type?: { name: string; code: string };
  severityCode: string;
  priorityCode: string;
  riskScore?: number;
  riskLevel?: string;
  incidentDate: string;
  reportedAt: string;
  department: string;
  ward?: string;
  location?: string;
  reporterId: string;
  assignedInvestigatorId?: string;
  patientMrn?: string;
  patientSnapshot?: Record<string, unknown>;
  employeeId?: string;
  description: string;
  immediateAction?: string;
  currentStage: string;
  isAnonymous: boolean;
  isNearMiss: boolean;
  isSentinelEvent: boolean;
  tags: string[];
  
  // SLA Flags
  slaResponseBreached: boolean;
  slaInvestigationBreached: boolean;
  slaCapaBreached: boolean;
  slaClosureBreached: boolean;

  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;

  // Relations (often expanded in API responses)
  attachments?: IncidentAttachment[];
}

export interface IncidentInvestigation {
  id: string;
  incidentId: string;
  title: string;
  leadId: string;
  teamMemberIds: string[];
  timelineNotes?: string;
  findings?: string;
  recommendations?: string;
  startedAt?: string;
  completedAt?: string;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentStatement {
  id: string;
  investigationId: string;
  statementType: string;
  personName: string;
  personRole?: string;
  department?: string;
  statementText: string;
  statementDate?: string;
  takenById: string;
  createdAt: string;
}

export interface IncidentRca {
  id: string;
  incidentId: string;
  investigationId?: string;
  conductedById: string;
  method: 'FIVE_WHY' | 'FISHBONE' | 'FAULT_TREE' | 'BOWTIE';
  summary?: string;
  rootCause?: string;
  status: ActionStatus;
  completedAt?: string;
}

export interface RcaFiveWhy {
  id: string;
  rcaId: string;
  whyNumber: number;
  whyText: string;
  because?: string;
  createdAt: string;
}

export interface RcaFishboneNode {
  id: string;
  rcaId: string;
  category: string; // e.g., 'PEOPLE', 'PROCESS', 'EQUIPMENT'
  causeText: string;
  parentId?: string;
  layout?: Record<string, unknown>;
  createdAt: string;
}

export interface IncidentCapa {
  id: string;
  incidentId: string;
  rcaId?: string;
  title: string;
  capaType: 'CORRECTIVE' | 'PREVENTIVE';
  description: string;
  ownerId: string;
  ownerName?: string;
  department?: string;
  dueDate: string;
  priorityCode?: string;
  status: ActionStatus;
  completedAt?: string;
  completionNotes?: string;
}

export interface IncidentVerification {
  id: string;
  capaId: string;
  incidentId?: string;
  verifiedById: string;
  verifiedAt: string;
  outcome: VerificationOutcome;
  notes?: string;
}

export interface IncidentClosure {
  id: string;
  incidentId: string;
  closedById: string;
  approvedById?: string;
  closureNotes: string;
  lessonsLearned?: string;
  finalRiskScore?: number;
  finalRiskLevel?: string;
  residualRiskAccepted?: boolean;
  residualRiskNotes?: string;
  closedAt?: string;
}

export interface IncidentTriage {
  id: string;
  incidentId: string;
  triagedById: string;
  assignedToId?: string;
  priorityCode?: string;
  responseSlaHours?: number;
  escalationRequired: boolean;
  escalationRoles?: string[];
  containmentRequired: boolean;
  containmentNotes?: string;
  triageNotes?: string;
  triagedAt: string;
}

export interface IncidentComment {
  id: string;
  incidentId: string;
  authorId: string;
  authorName?: string;
  content: string;
  visibility: CommentVisibility;
  createdAt: string;
}

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  eventType: string;
  actorId?: string;
  actorName?: string;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}
