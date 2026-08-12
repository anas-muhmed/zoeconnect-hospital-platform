import { Injectable, Logger } from '@nestjs/common';
import { AiOperatingMode } from '../policy/ai-operating-mode.policy';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';
import { AiRequestClassification } from '../governance/ai-request-classification';

export interface AiCapabilityMetadata {
  id: AiCapabilityType;
  version: string;
  maturity: 'EXPERIMENTAL' | 'BETA' | 'GA';
  supportedOperatingModes: AiOperatingMode[];
  requiredClassificationMax: AiRequestClassification;
  supportedProviders: string[];
  requiredValidators: string[];
  inputSchemaId?: string;
  outputSchemaId?: string;
}

@Injectable()
export class AiCapabilityRegistry {
  private readonly logger = new Logger(AiCapabilityRegistry.name);
  private capabilities = new Map<AiCapabilityType, AiCapabilityMetadata>();

  register(metadata: AiCapabilityMetadata): void {
    this.capabilities.set(metadata.id, metadata);
    this.logger.log(`Registered AI Capability: ${metadata.id} (v${metadata.version}) [${metadata.maturity}]`);
  }

  getCapability(id: AiCapabilityType): AiCapabilityMetadata | undefined {
    return this.capabilities.get(id);
  }

  listCapabilities(): AiCapabilityMetadata[] {
    return Array.from(this.capabilities.values());
  }
}
