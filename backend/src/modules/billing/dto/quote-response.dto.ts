import { ApiProperty } from '@nestjs/swagger';
import { BillingQuote, QuoteModuleBreakdownLine } from '../entities/billing-quote.entity';

/**
 * Public-safe projection of BillingQuote. Omits `quoteHash` and
 * `pricingVersion` -- internal integrity/versioning fields the frontend
 * has no use for and should not need to round-trip back to the backend
 * (checkout only ever references a quote by `id`).
 */
export class QuoteResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() billingCycle: string;
  @ApiProperty({ type: [String] }) modules: string[];
  @ApiProperty({ type: 'array' }) moduleBreakdown: QuoteModuleBreakdownLine[];
  @ApiProperty() currency: string;
  @ApiProperty() baseAmount: number;
  @ApiProperty() moduleAmount: number;
  @ApiProperty() discount: number;
  @ApiProperty() tax: number;
  @ApiProperty() total: number;
  @ApiProperty() status: string;
  @ApiProperty() quoteType: string;
  @ApiProperty() expiresAt: Date;
  @ApiProperty() createdAt: Date;

  static from(q: BillingQuote): QuoteResponseDto {
    const dto = new QuoteResponseDto();
    dto.id = q.id;
    dto.billingCycle = q.billingCycle;
    dto.modules = q.modules;
    dto.moduleBreakdown = q.moduleBreakdown;
    dto.currency = q.currency;
    dto.baseAmount = q.baseAmount;
    dto.moduleAmount = q.moduleAmount;
    dto.discount = q.discount;
    dto.tax = q.tax;
    dto.total = q.total;
    dto.status = q.status;
    dto.quoteType = q.quoteType;
    dto.expiresAt = q.expiresAt;
    dto.createdAt = q.createdAt;
    return dto;
  }
}
