import { AiCapabilityType, IAiCapability } from './ai-capability.interface';

export interface ProviderMetadata {
  supportsStreaming: boolean;
  supportsJson: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsEmbeddings: boolean;
  supportsImages: boolean;
  supportsMedicalCompliance: boolean;
  supportsOffline: boolean;
  maxContextWindow: number;
  costTier: 'LOW' | 'MEDIUM' | 'HIGH';
  latencyTier: 'LOW' | 'MEDIUM' | 'HIGH';
  securityTier: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED';
}

export interface IAiProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly metadata: ProviderMetadata;
  
  /**
   * Returns a list of capabilities supported by this provider.
   */
  getSupportedCapabilities(): AiCapabilityType[];

  /**
   * Retrieves the specific capability implementation if supported.
   * Throws an error if not supported.
   */
  getCapability<T extends IAiCapability>(type: AiCapabilityType): T;
}
