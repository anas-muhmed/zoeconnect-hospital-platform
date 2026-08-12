import {
  ArrayNotEmpty, IsArray, IsIn, IsInt, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BillingCycle } from '../entities/billing-quote.entity';

const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'YEARLY'];

/** One requested module + how many billing-cycle units to prepay for it (calendar months if billingCycle=MONTHLY, calendar years if YEARLY). Defaults to 1 if omitted. */
export class QuoteModuleRequestDto {
  @ApiProperty({ example: 'LOYALTY' })
  @IsString()
  code: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 24, required: false, default: 1 })
  @IsInt() @Min(1) @Max(24)
  months: number = 1;
}

/**
 * Body for POST /billing/quote. Deliberately minimal: the browser sends
 * WHAT the tenant wants (billing cycle + module codes + how many
 * cycle-units of each), never how much it costs. SubscriptionPricingService
 * computes every amount server-side from module_registry -- see that
 * service's doc comment. Whether a given code is a brand-new purchase or
 * "buy more months" on an already-licensed module is also determined
 * server-side (BillingQuoteService.createQuote()) -- the client never
 * declares intent, it just asks for a module + a duration.
 */
export class CreateQuoteDto {
  @ApiProperty({ enum: BILLING_CYCLES })
  @IsString() @IsIn(BILLING_CYCLES)
  billingCycle: BillingCycle;

  @ApiProperty({ type: [QuoteModuleRequestDto] })
  @IsArray() @ArrayNotEmpty()
  @ValidateNested({ each: true }) @Type(() => QuoteModuleRequestDto)
  modules: QuoteModuleRequestDto[];
}
