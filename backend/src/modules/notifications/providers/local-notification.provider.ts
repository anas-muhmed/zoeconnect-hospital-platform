import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INotificationProvider, NotificationResult } from '../../platform/infrastructure/notifications/notification-provider.interface';
import { INotificationTransport } from '../../platform/infrastructure/notifications/notification-transport.interface';
import { NOTIFICATION_TRANSPORT } from '../../platform/infrastructure/tokens';

/**
 * LocalNotificationProvider — Phase 5 ("Notification Providers", Task 5.2)
 * seam for the multi-channel `INotificationProvider`.
 *
 * Wraps today's actual notification behavior with ZERO functional change:
 *  - sendWhatsApp() delegates to the existing NOTIFICATION_TRANSPORT
 *    binding (Phase 2's WhatsAppTransport -> WhatsAppService -> Meta
 *    WhatsApp Cloud API) -- the one real, working channel today.
 *  - sendSms()/sendEmail() replicate NotificationProcessor's existing stub
 *    behavior exactly: log a warning, return a stub message ID, never
 *    fail. Neither channel has a real implementation anywhere in this
 *    codebase today (confirmed in Phase 2's pre-flight) -- this provider
 *    does not add one, it only relocates the existing stub logic behind
 *    the new interface so NotificationProcessor doesn't need channel-
 *    specific switch-case knowledge of "which channels are real."
 *  - sendPush() has no existing implementation or wired call path
 *    anywhere (NotificationChannel today is 'WHATSAPP' | 'SMS' | 'EMAIL'
 *    only) -- returns a structured "not implemented" result rather than
 *    throwing, so the interface contract holds even for an entirely
 *    unbuilt channel.
 */
@Injectable()
export class LocalNotificationProvider implements INotificationProvider {
  readonly id = 'local';
  readonly name = 'Local Notification Provider (WhatsApp live, SMS/Email stubbed)';

  private readonly logger = new Logger(LocalNotificationProvider.name);
  private readonly whatsAppConfigured: boolean;

  constructor(
    @Inject(NOTIFICATION_TRANSPORT) private readonly whatsAppTransport: INotificationTransport,
    private readonly config: ConfigService,
  ) {
    // Mirrors WhatsAppService's own `enabled` check (private there) --
    // duplicated rather than exposing a new public getter on an existing,
    // already-stable service, to keep this a purely additive Phase 5 change.
    this.whatsAppConfigured =
      !!this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '') &&
      !!this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
  }

  async sendWhatsApp(to: string, template: string, language: string, params: string[]): Promise<NotificationResult> {
    try {
      const providerMessageId = await this.whatsAppTransport.sendTemplate(to, template, language, params);
      return { success: true, providerMessageId, retryable: false };
    } catch (err) {
      // Preserves today's exact failure mode: WhatsAppService throws on a
      // failed API call; the caller (NotificationProcessor) is responsible
      // for translating a failed NotificationResult back into a thrown
      // error so BullMQ's existing retry-on-throw behavior is unchanged --
      // see notification.processor.ts's Task 5.2 update.
      const message = (err as Error).message;
      this.logger.warn(`WhatsApp send failed: ${message}`);
      return { success: false, errorCode: 'PROVIDER_ERROR', retryable: true };
    }
  }

  async sendSms(to: string, message: string): Promise<NotificationResult> {
    // Exact relocation of NotificationProcessor's pre-Phase-5 SMS stub:
    // logs and returns a fake message ID, never fails.
    this.logger.warn(`[STUB] SMS channel not yet implemented — would send to ${to}: "${message}"`);
    return { success: true, providerMessageId: `sms-stub-${Date.now()}`, retryable: false };
  }

  async sendEmail(to: string, subject: string, _body: string): Promise<NotificationResult> {
    // Exact relocation of NotificationProcessor's pre-Phase-5 Email stub.
    this.logger.warn(`[STUB] EMAIL channel not yet implemented — would send to ${to}: "${subject}"`);
    return { success: true, providerMessageId: `email-stub-${Date.now()}`, retryable: false };
  }

  async sendPush(to: string, _title: string, _body: string): Promise<NotificationResult> {
    this.logger.warn(`[STUB] PUSH channel has no implementation in any provider yet — skipping send to ${to}`);
    return { success: false, errorCode: 'NOT_IMPLEMENTED', retryable: false };
  }

  async healthCheck(): Promise<Record<'sms' | 'whatsapp' | 'email' | 'push', boolean>> {
    return {
      whatsapp: this.whatsAppConfigured,
      sms: false,
      email: false,
      push: false,
    };
  }
}
