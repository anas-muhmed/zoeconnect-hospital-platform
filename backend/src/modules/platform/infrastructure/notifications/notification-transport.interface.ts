/**
 * INotificationTransport (Phase 0 scaffolding — Hybrid Architecture roadmap).
 *
 * Shaped from today's `WhatsAppService.sendTemplate()`. Deliberately
 * scoped to template-based transports only (WhatsApp today; other
 * template-based channels later) — email is intentionally a separate,
 * later interface (`IEmailTransport`, Phase 5) since it has a different
 * payload shape, per the infrastructure/notifications vs
 * infrastructure/email split.
 *
 * Pure interface only — no implementation, no DI token, no consumer
 * yet. Nothing in the codebase depends on this today.
 */
export interface INotificationTransport {
  /**
   * Send a pre-approved template message.
   * @param to        Recipient identifier (e.g. E.164 phone number).
   * @param template   Exact template name registered with the provider.
   * @param language   BCP 47 language code.
   * @param params     Ordered list of template body parameters.
   * @returns          Provider-assigned message ID.
   */
  sendTemplate(
    to: string,
    template: string,
    language: string,
    params: string[],
  ): Promise<string>;
}
