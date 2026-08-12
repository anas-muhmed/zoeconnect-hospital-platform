import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { InjectDataSource } from '@nestjs/typeorm';
import { BillingWebhookEvent } from '../entities/billing-webhook-event.entity';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { NormalizedWebhookEvent } from '../payments/payment-provider.interface';
import { BillingCheckoutService } from './billing-checkout.service';

/**
 * ZoeConnect Billing, Phase 3 (requested refinement: WebhookProcessor
 * separate from the controller). Flow:
 *
 *   Controller -> verify signature (via PaymentProvider.handleWebhook)
 *              -> WebhookProcessor.process(normalizedEvent)
 *                   -> store event (idempotency ledger, DB transaction)
 *                   -> route to Billing/Subscription confirmation
 *
 * The signature check itself stays in the provider adapter (it needs the
 * raw body, which only the controller has direct access to via Fastify's
 * `rawBody`), but everything AFTER "this webhook is authentically from
 * the provider" lives here, not in the controller.
 *
 * Idempotency + transaction: the (provider, eventId) insert uses
 * `ON CONFLICT DO NOTHING` inside a DB transaction; if 0 rows were
 * inserted, this exact event was already recorded (a duplicate delivery
 * -- Razorpay, like most providers, does not guarantee at-most-once
 * delivery) and processing is skipped entirely, returning success so the
 * provider doesn't retry a delivery ZoeConnect has already handled.
 */
@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly checkoutService: BillingCheckoutService,
  ) {}

  async process(providerName: string, rawBody: Buffer, signatureHeader: string): Promise<void> {
    const provider = this.providerRegistry.getProvider(providerName);
    const event: NormalizedWebhookEvent = await provider.handleWebhook({ rawBody, signatureHeader }); // throws on invalid signature -- never reaches here unverified

    const isNew = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(BillingWebhookEvent)
        .values({
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload,
          processed: false,
        } as QueryDeepPartialEntity<BillingWebhookEvent>)
        .orIgnore() // ON CONFLICT DO NOTHING on the (provider, event_id) unique constraint
        .execute();
      return (result.identifiers?.length ?? 0) > 0;
    });

    if (!isNew) {
      this.logger.log(`Duplicate webhook event ignored: provider=${event.provider} eventId=${event.eventId} type=${event.eventType}`);
      return;
    }

    try {
      await this.route(event);
      await this.dataSource
        .createQueryBuilder()
        .update(BillingWebhookEvent)
        .set({ processed: true, processedAt: new Date() })
        .where('provider = :provider AND event_id = :eventId', { provider: event.provider, eventId: event.eventId })
        .execute();
    } catch (err) {
      // Leave `processed = false` on failure -- a redelivery (or an ops
      // replay) will retry `route()`; `confirmFromWebhook`/
      // `markFailedFromWebhook` are themselves idempotent, so re-running
      // them is always safe.
      this.logger.error(`Webhook processing failed for ${event.provider}:${event.eventId} (${event.eventType}): ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  private async route(event: NormalizedWebhookEvent): Promise<void> {
    switch (event.eventType) {
      case 'payment.captured': {
        const entity = (event.payload as any)?.payload?.payment?.entity;
        if (entity?.order_id && entity?.id) {
          await this.checkoutService.confirmFromWebhook(entity.order_id, entity.id);
        }
        break;
      }
      case 'payment.failed': {
        const entity = (event.payload as any)?.payload?.payment?.entity;
        if (entity?.order_id) {
          await this.checkoutService.markFailedFromWebhook(entity.order_id, entity?.error_description || 'Payment failed at provider');
        }
        break;
      }
      default:
        this.logger.debug(`Webhook event type '${event.eventType}' received, no handler wired -- ignoring (stored for audit).`);
    }
  }
}
