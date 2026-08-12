export enum AiApprovalLevel {
  AUTO_APPROVE = 'AUTO_APPROVE',
  HUMAN_REVIEW = 'HUMAN_REVIEW',
  DUAL_REVIEW = 'DUAL_REVIEW', // Two clinicians required
  RESTRICTED = 'RESTRICTED', // Needs committee/admin override
}

export interface AiApprovalPolicy {
  capability: string;
  classification: string;
  requiredApprovalLevel: AiApprovalLevel;
}

export interface AiApprovalRecord {
  auditId: string;
  reviewerId: string;
  action: 'APPROVED' | 'REJECTED' | 'EDITED';
  comments?: string;
  timestamp: Date;
}
