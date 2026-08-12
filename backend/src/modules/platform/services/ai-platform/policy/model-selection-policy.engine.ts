import { Injectable, Logger } from '@nestjs/common';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiCapabilityRegistry } from '../registries/ai-capability.registry';

export interface ModelSelectionContext {
  capability: AiCapabilityType;
  hospitalId?: string;
  securityLevel?: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED';
  budget?: 'LOW' | 'MEDIUM' | 'HIGH';
  availabilityRequirements?: 'OFFLINE' | 'ONLINE';
}

@Injectable()
export class ModelSelectionPolicyEngine {
  private readonly logger = new Logger(ModelSelectionPolicyEngine.name);

  constructor(private readonly capabilityRegistry: AiCapabilityRegistry) {}

  /**
   * Resolves the best provider for a given capability based on the context.
   */
  resolveProvider(context: ModelSelectionContext): IAiProvider {
    const candidates = this.capabilityRegistry.getProvidersForCapability(context.capability);

    this.logger.debug(`Resolving provider for capability ${context.capability} with context:`, context);

    // 1. Filter by Offline requirement
    let filteredCandidates = candidates;
    if (context.availabilityRequirements === 'OFFLINE') {
      filteredCandidates = candidates.filter(p => p.metadata.supportsOffline);
    }

    // 2. Filter by Security Tier
    if (context.securityLevel === 'RESTRICTED') {
      filteredCandidates = filteredCandidates.filter(p => p.metadata.securityTier === 'RESTRICTED');
    } else if (context.securityLevel === 'CONFIDENTIAL') {
      filteredCandidates = filteredCandidates.filter(p => ['RESTRICTED', 'CONFIDENTIAL'].includes(p.metadata.securityTier));
    }

    if (filteredCandidates.length === 0) {
      this.logger.warn(`No provider meets the strict policy requirements for capability ${context.capability}. Falling back to best available candidate.`);
      // If we fall back, at least try to respect offline if strictly required
      if (context.availabilityRequirements === 'OFFLINE') {
        const offlineProvider = candidates.find(p => p.metadata.supportsOffline);
        if (offlineProvider) return offlineProvider;
      }
      return candidates[0];
    }

    // 3. Sort by cost if budget is a concern
    if (context.budget === 'LOW') {
      filteredCandidates.sort((a, b) => {
        const costWeight = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
        return costWeight[a.metadata.costTier] - costWeight[b.metadata.costTier];
      });
    }

    return filteredCandidates[0];
  }
}
