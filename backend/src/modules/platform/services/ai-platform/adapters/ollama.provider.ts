import { Injectable, Logger } from '@nestjs/common';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiCapabilityType, IAiCapability } from '../interfaces/ai-capability.interface';

@Injectable()
export class OllamaProvider implements IAiProvider {
  public readonly id = 'ollama';
  public readonly name = 'Ollama';
  public readonly description = 'Local on-premise provider for offline deployments.';
  public readonly metadata = {
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsTools: false,
    supportsEmbeddings: true,
    supportsImages: false,
    supportsMedicalCompliance: true,
    supportsOffline: true,
    maxContextWindow: 8192,
    costTier: 'LOW' as const,
    latencyTier: 'MEDIUM' as const,
    securityTier: 'RESTRICTED' as const,
  };
  private readonly logger = new Logger(OllamaProvider.name);

  getSupportedCapabilities(): AiCapabilityType[] {
    return [
      AiCapabilityType.CHAT,
      AiCapabilityType.STRUCTURED_OUTPUT,
      AiCapabilityType.EMBEDDINGS,
    ];
  }

  getCapability<T extends IAiCapability>(type: AiCapabilityType): T {
    if (this.getSupportedCapabilities().includes(type)) {
      return {
        type,
        name: `${this.name} ${type} Capability`,
        description: `Implementation of ${type} for ${this.name}`,
        executeChat: async (messages: any[]) => ({ content: `Mock response from ${this.name}` }),
        executeStructured: async (prompt: string, schema: any) => ({ mock: true, provider: this.name }),
      } as any;
    }
    throw new Error(`Capability ${type} not supported by ${this.name}`);
  }
}
