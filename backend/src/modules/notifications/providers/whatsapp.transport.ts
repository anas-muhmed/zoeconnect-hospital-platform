import { Injectable } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp.service';
import { INotificationTransport } from '../../platform/infrastructure/notifications/notification-transport.interface';

/**
 * WhatsAppTransport — Phase 2 ("Infrastructure Abstraction") seam for
 * notifications.
 *
 * Thin wrapper around the existing `WhatsAppService`: delegates
 * `sendTemplate()` verbatim, introducing zero behavior change. The
 * signature here matches `WhatsAppService.sendTemplate()` exactly, so no
 * translation is needed.
 */
@Injectable()
export class WhatsAppTransport implements INotificationTransport {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  async sendTemplate(
    to: string,
    template: string,
    language: string,
    params: string[],
  ): Promise<string> {
    return this.whatsAppService.sendTemplate(to, template, language, params);
  }
}
