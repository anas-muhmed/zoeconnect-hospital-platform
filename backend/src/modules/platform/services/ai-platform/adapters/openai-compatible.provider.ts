import { Injectable, Logger } from '@nestjs/common';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiCapabilityType, IAiCapability } from '../interfaces/ai-capability.interface';

@Injectable()
export class OpenAiCompatibleProvider implements IAiProvider {
  public readonly id = 'openai-compatible';
  public readonly name = 'OpenAI Compatible API';
  public readonly description = 'Generic adapter for self-hosted or third-party models compatible with OpenAI API.';
  public readonly metadata = {
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: false,
    supportsTools: false,
    supportsEmbeddings: false,
    supportsImages: false,
    supportsMedicalCompliance: false,
    supportsOffline: true,
    maxContextWindow: 4096,
    costTier: 'LOW' as const,
    latencyTier: 'MEDIUM' as const,
    securityTier: 'PUBLIC' as const,
  };
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

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
