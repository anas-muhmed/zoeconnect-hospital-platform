import { AiOperatingMode } from '../policy/ai-operating-mode.policy';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';

export class AiTraceabilityEntity {
  id: string; // Unique traceability UUID
  
  // Provenance
  auditRecordId: string; // Links back to full inputs/outputs
  provider: string; // e.g. 'google-gemini'
  model: string; // e.g. 'gemini-1.5-pro'
  promptVersionId: string;
  capabilityVersionId: string;
  operatingMode: AiOperatingMode;
  
  // Context
  workflowInstanceId?: string;
  documentInstanceId?: string;
  executionContextVersion?: string; // Links to patient snapshot at time of execution

  // Output Evaluation
  confidenceScore: number;
  
  // Human-in-the-Loop Loop
  humanDecision?: 'ACCEPTED' | 'REJECTED' | 'EDITED';
  humanReviewerId?: string;
  humanReviewTimestamp?: Date;

  createdAt: Date;
}
