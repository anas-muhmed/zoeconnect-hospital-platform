import { AiCapabilityType } from './ai-capability.interface';
import { AiOperatingMode } from '../policy/ai-operating-mode.policy';

export interface AiExecutionRequest {
  capability: AiCapabilityType;
  prompt: string;
  context: Record<string, any>;
  operatingMode: AiOperatingMode;
  outputSchema?: any;
  streaming?: boolean;
  options?: {
    temperature?: number;
    maxTokens?: number;
    images?: string[]; // Base64 encoded or URLs
    [key: string]: any;
  };
}

export interface AiExecutionResult<T = unknown> {
  output: string;
  structuredOutput?: T;
  
  confidence?: {
    overall: number;
    extraction?: number;
    reasoning?: number;
    validation?: number;
    recommendation?: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  explainability?: {
    reasoning?: string;
    evidence?: string[];
    citations?: string[];
    assumptions?: string[];
    warnings?: string[];
  };

  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'ERROR' | 'UNKNOWN';
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latency: number;
  model: string;
  provider: string;
  safetyFlags: Record<string, boolean>;
  cost: number;
}
