import {
  BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { WebhookProcessorService } from '../services/webhook-processor.service';

/**
 * POST /billing/webhooks/razorpay -- @Public() (no JWT; Razorpay is not a
 * ZoeConnect user session) but every request is authenticated via
 * signature verification inside WebhookProcessorService/
 * RazorpayPaymentProvider.handleWebhook(), over the RAW request body
 * (`request.rawBody`, enabled globally in main.ts's
 * `NestFactory.create(AppModule, { rawBody: true })` -- the same
 * mechanism CloudLicensingHmacGuard already relies on). An invalid or
 * missing signature throws UnauthorizedException before any DB write
 * happens.
 *
 * Deliberately thin: signature verification + idempotent storage +
 * routing all live in WebhookProcessorService, not here (requested
 * refinement -- "Controller -> Verify Signature -> Store Event ->
 * Processor", not all logic inside the controller).
 */
@ApiExcludeController() // not part of the public Swagger surface -- it's a provider-to-server callback, not a tenant-facing API
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly processor: WebhookProcessorService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  // Deliberately generous (IP-based, since this route has no user session
  // to key off) -- Razorpay delivers from a shared IP pool and retries
  // aggressively on non-2xx, so a tight limit risks throttling legitimate
  // bursts (many tenants paying around the same time) rather than abuse.
  // This exists purely as a DoS backstop; correctness under duplicate/
  // retried delivery is already guaranteed by the (provider, event_id)
  // idempotency constraint regardless of whether a request is throttled.
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post('razorpay')
  @HttpCode(HttpStatus.OK)
  async razorpay(
    @Req() request: FastifyRequest & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!request.rawBody) {
      throw new BadRequestException('Raw body not available');
    }
    if (!signature) {
      throw new BadRequestException('Missing X-Razorpay-Signature header');
    }
    await this.processor.process('razorpay', request.rawBody, signature);
    return { received: true };
  }
}
