import { Injectable, Logger } from '@nestjs/common';

export interface ModelPricing {
  providerId: string;
  model: string;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  effectiveDate: string;
}

@Injectable()
export class PricingRepository {
  private readonly logger = new Logger(PricingRepository.name);
  
  // In-memory scaffold. Real app would query DB.
  private pricingTable: ModelPricing[] = [
    {
      providerId: 'google-gemini',
      model: 'gemini-1.5-pro',
      inputCostPer1kTokens: 0.0035,
      outputCostPer1kTokens: 0.0105,
      effectiveDate: '2024-05-14',
    },
    {
      providerId: 'openai',
      model: 'gpt-4o',
      inputCostPer1kTokens: 0.0050,
      outputCostPer1kTokens: 0.0150,
      effectiveDate: '2024-05-13',
    }
  ];

  async getPricing(providerId: string, model: string): Promise<ModelPricing | null> {
    const pricing = this.pricingTable.find(p => p.providerId === providerId && p.model === model);
    return pricing || null;
  }
}
