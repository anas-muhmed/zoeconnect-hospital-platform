import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Field names deliberately match what Razorpay Checkout's success
 * callback hands the frontend verbatim (`razorpay_order_id`,
 * `razorpay_payment_id`, `razorpay_signature`) -- this is the one place
 * in the public API surface that's allowed to look Razorpay-specific,
 * since it's transcribing an external widget's callback shape, not
 * ZoeConnect's own domain model. BillingCheckoutService immediately maps
 * these into the provider-neutral `VerifyPaymentInput` before calling
 * PaymentProvider.verifyPayment() -- nothing past that point sees these
 * field names.
 */
export class VerifyPaymentDto {
  @ApiProperty() @IsString()
  razorpay_order_id: string;

  @ApiProperty() @IsString()
  razorpay_payment_id: string;

  @ApiProperty() @IsString()
  razorpay_signature: string;
}
