import { ApiProperty } from '@nestjs/swagger';
import { BillingSubscription, SubscriptionBillingMode } from '../entities/billing-subscription.entity';
import { SubscriptionItemResponseDto } from './subscription-item-response.dto';

/**
 * Public-safe projection of BillingSubscription. Deliberately omits
 * `providerCustomerId` / `providerSubscriptionId` -- internal gateway
 * identifiers a tenant/frontend never needs and should never see in an
 * API response (refinement requested before Phase 3: "don't expose
 * provider IDs everywhere"). `provider` (the provider NAME, e.g.
 * 'razorpay') is kept since the billing UI reasonably shows "paid via
 * Razorpay".
 *
 * Phase 6: `items` is optional and populated only by callers that already
 * loaded/joined BillingSubscriptionItem + module catalog names (currently
 * just `GET /billing/subscription`) -- cancel()/reactivate() in
 * BillingSubscriptionController intentionally omit it since their
 * frontend callers already hold the current item list and re-fetching it
 * here would be redundant.
 *
 * Subscription Change Management: `billingMode` is likewise optional and
 * populated only by `GET /billing/subscription` (via
 * BillingSubscriptionService.determineBillingMode()) -- the ONE field the
 * Subscribe page must read to decide which of the three billing journeys
 * (NEW_SUBSCRIPTION / ACTIVE_SUBSCRIPTION / REACTIVATION) to present. The
 * frontend must never infer this from `status` itself.
 */
export class SubscriptionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() status: string;
  @ApiProperty() billingCycle: string;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true }) startDate: Date | null;
  @ApiProperty({ nullable: true }) currentPeriodStart: Date | null;
  @ApiProperty({ nullable: true }) currentPeriodEnd: Date | null;
  @ApiProperty() cancelAtPeriodEnd: boolean;
  @ApiProperty({ nullable: true }) provider: string | null;
  @ApiProperty({ type: [SubscriptionItemResponseDto], required: false }) items?: SubscriptionItemResponseDto[];
  @ApiProperty({ enum: ['NEW_SUBSCRIPTION', 'ACTIVE_SUBSCRIPTION', 'REACTIVATION'], required: false }) billingMode?: SubscriptionBillingMode;

  static from(sub: BillingSubscription, items?: SubscriptionItemResponseDto[], billingMode?: SubscriptionBillingMode): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.id = sub.id;
    dto.status = sub.status;
    dto.billingCycle = sub.billingCycle;
    dto.currency = sub.currency;
    dto.startDate = sub.startDate;
    dto.currentPeriodStart = sub.currentPeriodStart;
    dto.currentPeriodEnd = sub.currentPeriodEnd;
    dto.cancelAtPeriodEnd = sub.cancelAtPeriodEnd;
    dto.provider = sub.provider;
    if (items) dto.items = items;
    if (billingMode) dto.billingMode = billingMode;
    return dto;
  }
}
