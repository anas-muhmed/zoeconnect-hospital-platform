import { Injectable, Logger } from '@nestjs/common';
import {
  AiPlatformException,
  AiAuthenticationException,
  AiSafetyException,
  AiValidationException,
  AiRateLimitedException,
  AiProviderUnavailableException,
} from '../exceptions/ai-exceptions';

export interface RetryDecision {
  shouldRetry: boolean;
  shouldFallback: boolean;
  delayMs?: number;
}

@Injectable()
export class RetryPolicyService {
  private readonly logger = new Logger(RetryPolicyService.name);

  evaluateError(error: Error, currentAttempt: number, maxRetries = 2): RetryDecision {
    if (currentAttempt >= maxRetries) {
      this.logger.warn(`Max retries (${maxRetries}) reached.`);
      return { shouldRetry: false, shouldFallback: true };
    }

    if (error instanceof AiAuthenticationException || error instanceof AiSafetyException) {
      this.logger.error(`Fatal AI Exception: ${error.name}. No retry or fallback permitted.`);
      return { shouldRetry: false, shouldFallback: false };
    }

    if (error instanceof AiValidationException) {
      this.logger.warn('AI returned malformed output. Retrying once.');
      return { shouldRetry: currentAttempt < 1, shouldFallback: false, delayMs: 1000 };
    }

    if (error instanceof AiRateLimitedException) {
      this.logger.warn('AI Provider rate limited. Immediate fallback recommended.');
      return { shouldRetry: false, shouldFallback: true }; // Switch provider instead of waiting in V1
    }

    if (error instanceof AiProviderUnavailableException) {
      this.logger.warn('AI Provider unavailable. Retrying with exponential backoff.');
      return { shouldRetry: true, shouldFallback: false, delayMs: Math.pow(2, currentAttempt) * 1000 };
    }

    // Default catch-all
    return { shouldRetry: true, shouldFallback: false, delayMs: 1000 };
  }
}
