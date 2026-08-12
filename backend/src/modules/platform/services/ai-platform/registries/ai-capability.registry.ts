import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';
import { IAiProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class AiCapabilityRegistry {
  private readonly logger = new Logger(AiCapabilityRegistry.name);
  
  // Maps a capability type to a list of providers that support it
  private capabilityMap = new Map<AiCapabilityType, IAiProvider[]>();

  registerProviderCapabilities(provider: IAiProvider): void {
    const capabilities = provider.getSupportedCapabilities();
    for (const cap of capabilities) {
      if (!this.capabilityMap.has(cap)) {
        this.capabilityMap.set(cap, []);
      }
      this.capabilityMap.get(cap)!.push(provider);
    }
    this.logger.log(`Registered capabilities [${capabilities.join(', ')}] for provider ${provider.id}`);
  }

  getProvidersForCapability(capabilityType: AiCapabilityType): IAiProvider[] {
    const providers = this.capabilityMap.get(capabilityType);
    if (!providers || providers.length === 0) {
      throw new NotFoundException(`No providers registered for capability: ${capabilityType}`);
    }
    return providers;
  }
}
