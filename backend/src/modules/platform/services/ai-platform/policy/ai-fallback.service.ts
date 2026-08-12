import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionRequest } from '../interfaces/ai-execution.interface';
import { RetryPolicyService } from './retry.policy';

@Injectable()
export class AiFallbackService {
  private readonly logger = new Logger(AiFallbackService.name);

  constructor(private readonly retryPolicy: RetryPolicyService) {}

  /**
   * Determines the next provider in the fallback chain.
   * In a full implementation, this checks the Governance Pipeline's data classification
   * to ensure we don't fallback to a provider that violates policy (e.g. PHI to an open LLM).
   */
  getNextProvider(currentProviderId: string, request: AiExecutionRequest, attemptedProviders: string[]): string | null {
    // Scaffold implementation
    const fallbackChain = ['google-gemini', 'azure-openai', 'openai', 'ollama'];
    
    for (const provider of fallbackChain) {
      if (provider !== currentProviderId && !attemptedProviders.includes(provider)) {
        // Here we would check if `provider` is allowed by Governance for this `request`
        this.logger.log(`Fallback elected: ${provider}`);
        return provider;
      }
    }

    this.logger.error('No suitable fallback providers remain.');
    return null;
  }
}
