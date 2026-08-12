import { Injectable, Logger } from '@nestjs/common';
import { PricingRepository } from './pricing.repository';

@Injectable()
export class AiCostCalculatorService {
  private readonly logger = new Logger(AiCostCalculatorService.name);

  constructor(private readonly pricingRepo: PricingRepository) {}

  async calculateCost(providerId: string, model: string, inputTokens: number, outputTokens: number): Promise<number> {
    const pricing = await this.pricingRepo.getPricing(providerId, model);
    if (!pricing) {
      this.logger.warn(`No pricing found for ${providerId} / ${model}. Defaulting to 0.`);
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * pricing.outputCostPer1kTokens;
    
    return inputCost + outputCost;
  }
}
