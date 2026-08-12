import { ApiProperty } from '@nestjs/swagger';
import { BillingPayment } from '../entities/billing-payment.entity';

/**
 * Public-safe projection of BillingPayment. Deliberately omits
 * `providerPaymentId`/`providerOrderId`/`metadata` -- internal gateway
 * identifiers and raw provider payloads a tenant never needs to see,
 * consistent with SubscriptionResponseDto's existing rule of never
 * exposing provider IDs across the public billing API.
 */
export class PaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() provider: string;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) paidAt: Date | null;
  @ApiProperty({ nullable: true }) failureReason: string | null;
  @ApiProperty() createdAt: Date;

  static from(payment: BillingPayment): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    dto.id = payment.id;
    dto.provider = payment.provider;
    dto.amount = payment.amount;
    dto.currency = payment.currency;
    dto.status = payment.status;
    dto.paidAt = payment.paidAt;
    dto.failureReason = payment.failureReason;
    dto.createdAt = payment.createdAt;
    return dto;
  }
}
