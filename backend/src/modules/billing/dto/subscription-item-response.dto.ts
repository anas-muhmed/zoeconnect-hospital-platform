import { ApiProperty } from '@nestjs/swagger';

/** Display-only projection of a BillingSubscriptionItem joined with its module's catalog name. */
export class SubscriptionItemResponseDto {
  @ApiProperty() moduleCode: string;
  @ApiProperty() moduleName: string;
  @ApiProperty() unitPrice: number;
  @ApiProperty() billingCycle: string;
  /** This item's own paid-through date (per-module prepayment) -- see BillingSubscriptionItem.periodEnd doc comment. */
  @ApiProperty() periodEnd: Date;
}
