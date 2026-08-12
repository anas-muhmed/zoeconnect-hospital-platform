import { Injectable, Logger } from '@nestjs/common';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiCapabilityType, IAiCapability } from '../interfaces/ai-capability.interface';

@Injectable()
export class AzureOpenAiProvider implements IAiProvider {
  public readonly id = 'azure-openai';
  public readonly name = 'Azure OpenAI';
  public readonly description = 'Enterprise structured output and conversational provider.';
  public readonly metadata = {
    supportsStreaming: true,
    supportsJson: true,
    supportsVision: true,
    supportsTools: true,
    supportsEmbeddings: true,
    supportsImages: true,
    supportsMedicalCompliance: true,
    supportsOffline: false,
    maxContextWindow: 128000,
    costTier: 'MEDIUM' as const,
    latencyTier: 'LOW' as const,
    securityTier: 'RESTRICTED' as const,
  };
  private readonly logger = new Logger(AzureOpenAiProvider.name);

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
