import { Injectable, Logger } from '@nestjs/common';

export interface AiModelMetadata {
  provider: string; // e.g. 'google-gemini'
  modelName: string; // e.g. 'gemini-1.5-pro'
  aliases: string[]; // e.g. ['gpt-4-turbo']
  contextWindow: number;
  pricing: {
    inputPer1k: number;
    outputPer1k: number;
  };
  latencyClass: 'LOW' | 'MEDIUM' | 'HIGH';
  capabilities: {
    structuredOutput: boolean;
    vision: boolean;
    ocr: boolean;
    embeddings: boolean;
    streaming: boolean;
    toolCalling: boolean;
    jsonMode: boolean;
    reasoningCapability: boolean;
  };
  certificationStatus: 'CERTIFIED' | 'EXPERIMENTAL' | 'REJECTED';
  lifecycleStatus: 'ACTIVE' | 'DEPRECATED' | 'EOL';
}

@Injectable()
export class AiModelRegistry {
  private readonly logger = new Logger(AiModelRegistry.name);
  private models = new Map<string, AiModelMetadata>();

  registerModel(metadata: AiModelMetadata): void {
    const key = `${metadata.provider}:${metadata.modelName}`;
    this.models.set(key, metadata);
    this.logger.log(`Registered AI Model: ${key} [${metadata.certificationStatus}]`);
  }

  getModelsByCapability(requiredCapability: keyof AiModelMetadata['capabilities']): AiModelMetadata[] {
    return Array.from(this.models.values()).filter(m => m.capabilities[requiredCapability]);
  }
}
