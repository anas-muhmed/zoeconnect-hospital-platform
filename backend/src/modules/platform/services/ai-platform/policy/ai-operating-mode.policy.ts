export enum AiOperatingMode {
  ASSISTIVE = 'ASSISTIVE',
  SUPERVISED = 'SUPERVISED',
  ADMINISTRATIVE_AUTOMATION = 'ADMINISTRATIVE_AUTOMATION',
  RESTRICTED_AUTONOMOUS = 'RESTRICTED_AUTONOMOUS',
}

export interface AiOperatingModePolicy {
  mode: AiOperatingMode;
  canExecuteActions: boolean;
  requiresHumanApproval: boolean;
  maximumRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  auditLevel: 'STANDARD' | 'ENHANCED' | 'STRICT';
  providerRestrictions?: string[]; // Array of allowed provider IDs
}

export const AiOperatingModePolicies: Record<AiOperatingMode, AiOperatingModePolicy> = {
  [AiOperatingMode.ASSISTIVE]: {
    mode: AiOperatingMode.ASSISTIVE,
    canExecuteActions: false,
    requiresHumanApproval: true,
    maximumRiskLevel: 'LOW',
    auditLevel: 'STANDARD',
  },
  [AiOperatingMode.SUPERVISED]: {
    mode: AiOperatingMode.SUPERVISED,
    canExecuteActions: true,
    requiresHumanApproval: true,
    maximumRiskLevel: 'MEDIUM',
    auditLevel: 'ENHANCED',
  },
  [AiOperatingMode.ADMINISTRATIVE_AUTOMATION]: {
    mode: AiOperatingMode.ADMINISTRATIVE_AUTOMATION,
    canExecuteActions: true,
    requiresHumanApproval: false,
    maximumRiskLevel: 'LOW',
    auditLevel: 'STRICT',
  },
  [AiOperatingMode.RESTRICTED_AUTONOMOUS]: {
    mode: AiOperatingMode.RESTRICTED_AUTONOMOUS,
    canExecuteActions: true,
    requiresHumanApproval: false,
    maximumRiskLevel: 'HIGH', // High risk tasks require Strict Auditing
    auditLevel: 'STRICT',
  },
};
