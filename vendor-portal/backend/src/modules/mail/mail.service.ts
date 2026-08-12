import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

/**
 * MailService — transactional email for the Vendor Portal backend, backed
 * by Resend.
 *
 * Deliberately standalone rather than reusing the main `backend` app's
 * NotificationModule / CloudNotificationProvider (AWS SES-backed): this is
 * a separate NestJS application with no shared workspace package between
 * the two today, and standing up real delivery here shouldn't require a
 * cross-app refactor just to fix sign-up OTP delivery. Keeps the Vendor
 * Portal independently deployable. If a shared notification abstraction is
 * ever built across both apps, this is a natural candidate to fold into it.
 *
 * Reads config directly from `process.env`, matching this app's existing
 * convention (see AppModule's TypeOrmModule.forRoot() / database.config.ts)
 * — @nestjs/config isn't a dependency here, unlike the main `backend` app.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private _client: Resend | undefined;
  private readonly fromAddress: string;

  constructor() {
    this.fromAddress = process.env.MAIL_FROM_ADDRESS ?? '';
  }

  // Client construction deferred to first actual send, not done in the
  // constructor — same pattern (and same rationale) as
  // CloudNotificationProvider's sesClient/snsClient getters in the main
  // backend app: avoids doing any client setup for a module that never
  // ends up sending mail, and keeps the constructor itself trivial.
  private get client(): Resend {
    if (!this._client) {
      const apiKey = process.env.RESEND_API_KEY ?? '';
      if (!apiKey) {
        this.logger.warn('RESEND_API_KEY is not set — outgoing mail will fail until it is configured.');
      }
      this._client = new Resend(apiKey);
    }
    return this._client;
  }

  /**
   * Cheap, non-network configuration check -- used by MailHealthIndicator
   * (readiness follow-up, 2026-08). Deliberately does NOT attempt a real
   * Resend API call: a readiness endpoint that's polled every ~15s by
   * Docker's HEALTHCHECK, plus by deploy.sh/rollback.sh on every
   * deployment, must not send real outbound requests to a paid external
   * API on that cadence. Presence of both required env vars is the
   * meaningful, safe-to-poll signal -- an invalid-but-present API key
   * would only surface on an actual send, which sendOtpEmail() already
   * throws loudly on.
   */
  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY) && Boolean(this.fromAddress);
  }

  /**
   * Sends a sign-up verification code via Resend.
   *
   * Throws on failure (missing config, network error, invalid API key,
   * Resend-side rejection) rather than swallowing it — unlike the old
   * logger.warn()-and-return-ok placeholder this replaces, callers need to
   * know delivery genuinely failed so they can surface that to the caller
   * instead of silently leaving them with a code they were never given.
   */
  async sendOtpEmail(to: string, code: string, ttlMinutes: number): Promise<void> {
    if (!this.fromAddress) {
      throw new Error('MAIL_FROM_ADDRESS is not configured — cannot send outgoing mail.');
    }

    const { error } = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject: 'Your ZoeConnect Vendor Portal verification code',
      text: `Your verification code is ${code}. It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    if (error) {
      this.logger.warn(`Resend rejected OTP email to ${to}: ${error.message ?? JSON.stringify(error)}`);
      throw new Error(`Failed to send verification email: ${error.message ?? 'unknown Resend error'}`);
    }
  }
}
