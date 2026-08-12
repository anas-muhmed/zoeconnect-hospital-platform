import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { INotificationProvider, NotificationResult } from '../../platform/infrastructure/notifications/notification-provider.interface';
import { INotificationTransport } from '../../platform/infrastructure/notifications/notification-transport.interface';
import { NOTIFICATION_TRANSPORT } from '../../platform/infrastructure/tokens';

/**
 * CloudNotificationProvider — Phase 5 ("Notification Providers", Task 5.3)
 * second `INotificationProvider` implementation, proving the abstraction
 * holds for a genuinely different vendor stack, not just a second
 * WhatsApp integration.
 *
 * Channel-by-channel scope, deliberately not uniform across channels:
 *  - sendEmail() -- REAL implementation via AWS SES. Email has no
 *    implementation anywhere in this codebase (confirmed gap, Phase 2's
 *    pre-flight); this is genuinely new capability.
 *  - sendSms() -- REAL implementation via AWS SNS. Same story: SMS was a
 *    stub-only "future work" comment before Phase 5, never a real
 *    integration.
 *  - sendWhatsApp() -- delegates to the SAME NOTIFICATION_TRANSPORT
 *    (Meta WhatsApp Cloud API) as LocalNotificationProvider. This is
 *    deliberate, not an oversight: Meta's WhatsApp Cloud API already IS
 *    "the cloud" for this channel -- there is no meaningful local/cloud
 *    distinction to draw for WhatsApp specifically, and reimplementing a
 *    second WhatsApp integration (e.g. via a different vendor) would add
 *    integration surface without proving anything the abstraction doesn't
 *    already prove via SES/SNS.
 *  - sendPush() -- no push infrastructure exists in either provider;
 *    returns the same structured "not implemented" result as Local.
 */
@Injectable()
export class CloudNotificationProvider implements INotificationProvider {
  readonly id = 'cloud';
  readonly name = 'AWS Cloud Notification Provider (SES email, SNS SMS, shared WhatsApp transport)';

  private readonly logger = new Logger(CloudNotificationProvider.name);
  private _sesClient: SESClient | undefined;
  private _snsClient: SNSClient | undefined;
  private readonly fromEmail: string;
  private readonly senderId: string;

  constructor(
    @Inject(NOTIFICATION_TRANSPORT) private readonly whatsAppTransport: INotificationTransport,
    private readonly config: ConfigService,
  ) {
    // SES/SNS client construction is deferred to first actual use (see the
    // `sesClient`/`snsClient` getters below) rather than done here. Like
    // StorageModule/S3StorageProvider (same bug, fixed earlier this
    // session), NotificationModule always registers CloudNotificationProvider
    // as an ordinary provider regardless of NOTIFICATION_PROVIDER_MODE, and
    // the AWS SDK v3's client constructors synchronously validate config,
    // throwing "Region is missing" when region resolves to an empty string
    // -- which it always does unless AWS_REGION is set. Building both
    // clients eagerly crashed every boot that wasn't explicitly configured
    // for the cloud provider.
    this.fromEmail = this.config.get<string>('SES_FROM_EMAIL', '');
    this.senderId = this.config.get<string>('SNS_SENDER_ID', '');
  }

  private get sesClient(): SESClient {
    if (!this._sesClient) {
      this._sesClient = new SESClient({
        region: this.config.get<string>('AWS_REGION', ''),
        credentials: {
          accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
          secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
        },
      });
    }
    return this._sesClient;
  }

  private get snsClient(): SNSClient {
    if (!this._snsClient) {
      this._snsClient = new SNSClient({
        region: this.config.get<string>('AWS_REGION', ''),
        credentials: {
          accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
          secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
        },
      });
    }
    return this._snsClient;
  }

  async sendWhatsApp(to: string, template: string, language: string, params: string[]): Promise<NotificationResult> {
    // Shared with LocalNotificationProvider -- see class doc comment.
    try {
      const providerMessageId = await this.whatsAppTransport.sendTemplate(to, template, language, params);
      return { success: true, providerMessageId, retryable: false };
    } catch (err) {
      this.logger.warn(`WhatsApp send failed: ${(err as Error).message}`);
      return { success: false, errorCode: 'PROVIDER_ERROR', retryable: true };
    }
  }

  async sendSms(to: string, message: string): Promise<NotificationResult> {
    try {
      const command = new PublishCommand({
        PhoneNumber: to,
        Message: message,
        ...(this.senderId
          ? { MessageAttributes: { 'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: this.senderId } } }
          : {}),
      });
      const result = await this.snsClient.send(command);
      if (!result.MessageId) {
        return { success: false, errorCode: 'NO_MESSAGE_ID', retryable: true };
      }
      return { success: true, providerMessageId: result.MessageId, retryable: false };
    } catch (err) {
      const error = err as Error & { retryable?: boolean };
      this.logger.warn(`SNS SMS send failed: ${error.message}`);
      // AWS SDK v3 errors expose a $retryable-ish `retryable` hint on
      // throttling/5xx errors; anything else (bad phone number, opted-out
      // recipient) is treated as permanent.
      return { success: false, errorCode: 'PROVIDER_ERROR', retryable: !!error.retryable };
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<NotificationResult> {
    try {
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
      });
      const result = await this.sesClient.send(command);
      if (!result.MessageId) {
        return { success: false, errorCode: 'NO_MESSAGE_ID', retryable: true };
      }
      return { success: true, providerMessageId: result.MessageId, retryable: false };
    } catch (err) {
      const error = err as Error & { retryable?: boolean };
      this.logger.warn(`SES email send failed: ${error.message}`);
      return { success: false, errorCode: 'PROVIDER_ERROR', retryable: !!error.retryable };
    }
  }

  async sendPush(to: string, _title: string, _body: string): Promise<NotificationResult> {
    this.logger.warn(`[STUB] PUSH channel has no implementation in any provider yet — skipping send to ${to}`);
    return { success: false, errorCode: 'NOT_IMPLEMENTED', retryable: false };
  }

  async healthCheck(): Promise<Record<'sms' | 'whatsapp' | 'email' | 'push', boolean>> {
    return {
      whatsapp: true, // shared transport; assumed configured if this provider is bound at all
      sms: !!this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
      email: !!this.fromEmail,
      push: false,
    };
  }
}
