import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type { WhatsAppMessageResponse } from './notification.types';

/**
 * Thin wrapper around the Meta WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly client: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const token       = config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const apiVersion  = config.get<string>('WHATSAPP_API_VERSION', 'v18.0');
    this.enabled      = !!token && !!this.phoneNumberId;

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });

    if (!this.enabled) {
      this.logger.warn(
        'WhatsApp not configured — WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing. ' +
        'Notifications will be logged but not sent.',
      );
    }
  }

  /**
   * Send a pre-approved template message.
   * @param to          Recipient phone in E.164 format (+91XXXXXXXXXX)
   * @param template    Exact template name registered on Meta Business Manager
   * @param language    BCP 47 code, default 'en_US'
   * @param params      Ordered list of {{N}} body-component parameters
   * @returns           Provider message ID
   */
  async sendTemplate(
    to: string,
    template: string,
    language: string,
    params: string[],
  ): Promise<string> {
    if (!this.enabled) {
      this.logger.log(
        `[STUB] Would send WhatsApp template "${template}" to ${to} with params: ${JSON.stringify(params)}`,
      );
      return `stub-${Date.now()}`;
    }

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: language },
        components: params.length
          ? [
              {
                type: 'body',
                parameters: params.map((p) => ({ type: 'text', text: String(p) })),
              },
            ]
          : [],
      },
    };

    const res = await this.client.post<WhatsAppMessageResponse>(
      `/${this.phoneNumberId}/messages`,
      body,
    );

    const msgId = res.data.messages?.[0]?.id;
    if (!msgId) throw new Error('No message ID returned from WhatsApp API');

    this.logger.log(`WhatsApp sent: template="${template}" to=${to} msgId=${msgId}`);
    return msgId;
  }

  /**
   * Mark a message as read (for received messages — included for completeness).
   */
  async markRead(messageId: string): Promise<void> {
    if (!this.enabled) return;
    await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }
}
