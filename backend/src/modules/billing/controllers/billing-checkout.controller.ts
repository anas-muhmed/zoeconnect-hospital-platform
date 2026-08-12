import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { BillingCheckoutService } from '../services/billing-checkout.service';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';

/**
 * Tenant resolved exclusively from the JWT, exactly like the quote/
 * subscription controllers. `POST /billing/payments/verify` is the
 * "backend verification" step -- it is NOT what activates the
 * subscription/entitlements by itself in spirit; it activates them only
 * because it performed real provider-signature verification first (see
 * BillingCheckoutService.verifyPayment()). The Razorpay webhook
 * (BillingWebhookController) is the authoritative, retry-safe path that
 * converges on the exact same idempotent confirmation logic, so a
 * dropped verify call (e.g. the user closes the tab right after paying)
 * still results in a correctly activated subscription once the webhook
 * arrives.
 */
@ApiTags('Billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('billing')
export class BillingCheckoutController {
  constructor(private readonly checkoutService: BillingCheckoutService) {}

  @Post('checkout')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a payment-provider order for a validated quote. Returns only what the frontend needs to open the checkout widget -- no secrets.' })
  createCheckout(@Body() dto: CreateCheckoutDto, @CurrentUser() actor: User) {
    return this.checkoutService.createCheckout(actor.tenantId, dto.quoteId);
  }

  @Post('payments/verify')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "Verify a Razorpay Checkout success callback server-side. Never treat the frontend callback firing as proof of payment on its own." })
  verifyPayment(@Body() dto: VerifyPaymentDto, @CurrentUser() actor: User) {
    return this.checkoutService.verifyPayment(actor.tenantId, dto);
  }
}
