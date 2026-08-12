/**
 * INotificationProvider (Phase 5 "Notification Providers").
 *
 * A higher-level, multi-channel notification abstraction, deliberately
 * layered ON TOP OF the existing `INotificationTransport` (Phase 2) rather
 * than replacing it:
 *
 *   Application
 *      |
 *   INotificationProvider   (Phase 5 -- this file: channel-level policy,
 *      |                     multi-channel: SMS/WhatsApp/Email/Push)
 *      |
 *   INotificationTransport  (Phase 2 -- template-message transport,
 *      |                     WhatsApp-specific today)
 *      |
 *   WhatsAppService          (existing Meta WhatsApp Cloud API wrapper)
 *
 * `LocalNotificationProvider`'s `sendWhatsApp()` composes the existing
 * `NOTIFICATION_TRANSPORT` binding rather than reimplementing WhatsApp
 * delivery -- Phase 2's transport-level seam stays exactly as useful as it
 * was, this phase just adds channel breadth (SMS/Email/Push) and a
 * provider-agnostic result shape around it.
 *
 * Deliberately transport-agnostic: methods take plain, channel-appropriate
 * arguments and return a single `NotificationResult` shape regardless of
 * which vendor (Meta, AWS SES/SNS, Twilio, etc.) actually handled the send,
 * so provider-specific response objects never leak into application code.
 */

/**
 * Uniform result shape for every `INotificationProvider` send method.
 *
 * `retryable` is the caller-facing retry decision, decoupled from HTTP
 * status codes or vendor-specific error shapes:
 *   - Permanent failure (bad phone number, template not approved, invalid
 *     recipient) -> `retryable: false` -- don't retry, the same call will
 *     fail again.
 *   - Temporary failure (rate limit, provider 5xx, network timeout) ->
 *     `retryable: true` -- safe to retry (the existing BullMQ job-retry
 *     mechanism in `NotificationProcessor` already does this by re-throwing;
 *     Phase 5 preserves that behavior, see LocalNotificationProvider).
 *   - Provider unavailable entirely (e.g. AWS SES outage) -> also
 *     `retryable: true` for now. A future phase could add automatic
 *     provider fallback (e.g. cloud -> local) when `retryable && attempts
 *     exhausted`; NOT implemented in Phase 5 -- documented here so the
 *     contract doesn't need to change shape when that's built.
 */
export interface NotificationResult {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  retryable: boolean;
}

export interface INotificationProvider {
  readonly id: string; // e.g., 'local', 'cloud'
  readonly name: string;

  sendSms(to: string, message: string): Promise<NotificationResult>;

  sendWhatsApp(to: string, template: string, language: string, params: string[]): Promise<NotificationResult>;

  sendEmail(to: string, subject: string, body: string): Promise<NotificationResult>;

  sendPush(to: string, title: string, body: string): Promise<NotificationResult>;

  /**
   * Reports whether this provider's underlying channels are configured and
   * reachable. Per-channel, not a single boolean, since a provider can have
   * some channels configured and others not (e.g. LocalNotificationProvider
   * has WhatsApp configured but SMS/Email are stubs today).
   */
  healthCheck(): Promise<Record<'sms' | 'whatsapp' | 'email' | 'push', boolean>>;
}
