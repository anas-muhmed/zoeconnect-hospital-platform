export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED';

export type NotificationEventType =
  | 'WELCOME'
  | 'EARN_POINTS'
  | 'REDEEM_POINTS'
  | 'BIRTHDAY_BONUS'
  | 'CAMPAIGN_BONUS'
  | 'TIER_UPGRADE'
  | 'ACCOUNT_EXPIRY_WARNING'
  | 'CUSTOM';

export interface NotificationPayload {
  /** Phone number in E.164 format e.g. +919876543210 */
  phone: string;
  /** Template name registered on Meta Business (for WhatsApp) */
  templateName: string;
  /** Language code e.g. 'en_US' */
  languageCode?: string;
  /** Ordered list of body component parameters */
  templateParams: string[];
  /** Which channel to send via */
  channel: NotificationChannel;
  /** Optional FK to loyalty account */
  loyaltyAccountId?: string;
  /** Patient MRN for reference */
  mrn?: string;
  /** Event that triggered this notification */
  eventType: NotificationEventType;
  /** Arbitrary metadata to store alongside the log */
  metadata?: Record<string, unknown>;
}

export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}
