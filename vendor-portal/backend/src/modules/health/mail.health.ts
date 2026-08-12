import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { MailService } from '../mail/mail.service';

/**
 * "Critical subsystems, not just infrastructure" readiness follow-up
 * (2026-08). vendor-postgres being reachable doesn't prove sign-up OTP
 * delivery (this app's one real external dependency besides its own DB)
 * actually works. Checks configuration presence only -- see
 * MailService.isConfigured()'s own comment for why this deliberately does
 * NOT make a live Resend API call on every readiness poll.
 */
@Injectable()
export class MailHealthIndicator extends HealthIndicator {
  constructor(private readonly mailService: MailService) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    if (!this.mailService.isConfigured()) {
      const result = this.getStatus(key, false, {
        error: 'RESEND_API_KEY and/or MAIL_FROM_ADDRESS are not set -- outgoing mail (sign-up OTP delivery) will fail.',
      });
      throw new HealthCheckError('Mail service check failed', result);
    }
    return this.getStatus(key, true, {});
  }
}
