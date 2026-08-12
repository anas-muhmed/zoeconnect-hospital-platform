import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationService } from './notification.service';
import { INotificationProvider, NotificationResult } from '../platform/infrastructure/notifications/notification-provider.interface';
import { NOTIFICATION_PROVIDER } from '../platform/infrastructure/tokens';
import { QUEUE_NAMES }         from '../../config/redis.config';
import type { NotificationPayload } from './notification.types';

interface NotificationJob {
  logId: string;
  payload: NotificationPayload;
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly notifService: NotificationService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notificationProvider: INotificationProvider,
  ) {}

  @Process('send-notification')
  async handleSend(job: Job<NotificationJob>): Promise<void> {
    const { logId, payload } = job.data;

    await this.notifService.incrementAttempts(logId);

    try {
      let result: NotificationResult;

      switch (payload.channel) {
        case 'WHATSAPP':
          result = await this.notificationProvider.sendWhatsApp(
            payload.phone,
            payload.templateName,
            payload.languageCode ?? 'en_US',
            payload.templateParams,
          );
          break;

        case 'SMS':
          result = await this.notificationProvider.sendSms(payload.phone, payload.templateParams.join(' '));
          break;

        case 'EMAIL':
          result = await this.notificationProvider.sendEmail(payload.phone, payload.templateName, payload.templateParams.join(' '));
          break;

        default:
          throw new Error(`Unsupported channel: ${(payload as NotificationPayload).channel}`);
      }

      // Phase 5 (Task 5.2): INotificationProvider returns a structured
      // NotificationResult instead of throwing on failure (see the
      // interface's doc comment). Translate `success: false` back into a
      // thrown error here so BullMQ's pre-existing retry-on-throw behavior
      // (the catch block below) is completely unchanged -- this preserves
      // the exact same retry semantics that existed when WhatsAppTransport
      // threw directly.
      if (!result.success) {
        throw new Error(result.errorCode ?? 'Notification send failed');
      }

      const providerMessageId = result.providerMessageId ?? `${payload.channel.toLowerCase()}-unknown-${Date.now()}`;
      await this.notifService.markSent(logId, providerMessageId);
      this.logger.log(
        `Notification sent: logId=${logId} channel=${payload.channel} event=${payload.eventType} msgId=${providerMessageId}`,
      );
    } catch (err) {
      const error = err as Error;
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;

      this.logger.error(
        `Notification failed: logId=${logId} attempt=${job.attemptsMade + 1} error=${error.message}`,
      );

      if (isFinalAttempt) {
        await this.notifService.markFailed(logId, error.message, job.attemptsMade + 1);
      }

      // Re-throw so BullMQ knows to retry
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<NotificationJob>, err: Error) {
    this.logger.error(
      `Queue job failed permanently: logId=${job.data.logId} attempts=${job.attemptsMade} error=${err.message}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<NotificationJob>) {
    this.logger.debug(`Queue job completed: logId=${job.data.logId}`);
  }
}
