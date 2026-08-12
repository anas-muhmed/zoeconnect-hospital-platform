import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiCapabilityRegistry } from './ai-capability.registry';

@Injectable()
export class AiProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(AiProviderRegistry.name);
  private providers = new Map<string, IAiProvider>();

  constructor(private readonly capabilityRegistry: AiCapabilityRegistry) {}

  onModuleInit() {
    this.logger.log('AI Provider Registry Initialized');
  }

  registerProvider(provider: IAiProvider): void {
    if (this.providers.has(provider.id)) {
      this.logger.warn(`Provider ${provider.id} is already registered. Overwriting.`);
    }
    this.providers.set(provider.id, provider);
    this.capabilityRegistry.registerProviderCapabilities(provider);
    this.logger.log(`Registered AI Provider: ${provider.name} (${provider.id})`);
  }

  getProvider(providerId: string): IAiProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new NotFoundException(`AI Provider with ID ${providerId} not found`);
    }
    return provider;
  }

  getAllProviders(): IAiProvider[] {
    return Array.from(this.providers.values());
  }
}
