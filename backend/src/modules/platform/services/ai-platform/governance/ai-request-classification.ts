export enum AiRequestClassification {
  PUBLIC = 'PUBLIC', // No sensitive data
  INTERNAL = 'INTERNAL', // Internal hospital documents, no PHI
  PATIENT_DATA = 'PATIENT_DATA', // Contains PHI/PII
  CLINICAL_DECISION_SUPPORT = 'CLINICAL_DECISION_SUPPORT', // High risk, direct patient care
  ADMINISTRATIVE = 'ADMINISTRATIVE', // Low risk operations
  HIGH_RISK = 'HIGH_RISK', // Anything legally or medically complex
}

export interface AiRequestClassificationProfile {
  classification: AiRequestClassification;
  allowedProviders: string[];
  requiresAudit: boolean;
  requiresHumanApproval: boolean;
  retentionDays: number;
}
