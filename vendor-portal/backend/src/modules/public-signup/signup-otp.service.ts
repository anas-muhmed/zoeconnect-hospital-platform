import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { EmailOtpVerification } from './entities/email-otp-verification.entity';
import { MailService } from '../mail/mail.service';

const OTP_TTL_MINUTES          = 10;   // how long a requested code is valid
const VERIFIED_WINDOW_MINUTES  = 30;   // how long AFTER verifying the signee has to complete register()
const MAX_ATTEMPTS_PER_CODE    = 5;    // wrong-code guesses before a code is dead
const MAX_REQUESTS_PER_HOUR    = 5;    // rate limit on request-otp itself, same convention as password-reset.service.ts's MAX_REQUESTS_PER_DAY

@Injectable()
export class SignupOtpService {
  private readonly logger = new Logger(SignupOtpService.name);

  constructor(
    @InjectRepository(EmailOtpVerification)
    private readonly otpRepo: Repository<EmailOtpVerification>,
    private readonly mailService: MailService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Generates and sends a 6-digit code via MailService (Resend). This used
   * to be logged to the server console instead of emailed regardless of
   * NODE_ENV -- there was no environment check at all, just an unfinished
   * placeholder, which is why it kept happening in production too. Now
   * delivered for real; MailService.sendOtpEmail() throws on genuine send
   * failure (bad config, Resend rejection, network error), which propagates
   * out of this method as a 500 rather than silently returning ok:true with
   * a code the caller was never actually given.
   */
  async requestOtp(emailRaw: string): Promise<{ ok: true }> {
    const email = this.normalizeEmail(emailRaw);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required');
    }

    const since = new Date(Date.now() - 3600_000);
    const recentCount = await this.otpRepo.count({
      where: { email, requestedAt: MoreThan(since) },
    });
    if (recentCount >= MAX_REQUESTS_PER_HOUR) {
      // Silently no-op past the rate limit -- same "don't tell an
      // unauthenticated caller whether they've been rate limited or not"
      // posture as PasswordResetService.forgotPassword().
      this.logger.warn(`requestOtp: rate limit hit for ${email}`);
      return { ok: true };
    }

    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    const row = this.otpRepo.create({
      email,
      codeHash: this.hashCode(code),
      expiresAt,
      verified: false,
      verifiedAt: null,
      consumedAt: null,
      attempts: 0,
    });
    await this.otpRepo.save(row);

    await this.mailService.sendOtpEmail(email, code, OTP_TTL_MINUTES);

    return { ok: true };
  }

  /**
   * Verifies a code against the most recent still-live (unexpired,
   * unconsumed) OTP row for the email. On success, marks that row
   * `verified` -- `register()` later checks for a verified, unconsumed row
   * within `VERIFIED_WINDOW_MINUTES` before provisioning.
   */
  async verifyOtp(emailRaw: string, code: string): Promise<{ verified: true }> {
    const email = this.normalizeEmail(emailRaw);
    const row = await this.otpRepo.findOne({
      where: { email, consumedAt: IsNull() },
      order: { requestedAt: 'DESC' },
    });

    if (!row) {
      throw new BadRequestException('No pending verification for this email — request a new code');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This code has expired — request a new one');
    }
    if (row.attempts >= MAX_ATTEMPTS_PER_CODE) {
      throw new BadRequestException('Too many incorrect attempts — request a new code');
    }

    if (row.codeHash !== this.hashCode((code ?? '').trim())) {
      await this.otpRepo.update(row.id, { attempts: row.attempts + 1 });
      throw new BadRequestException('Incorrect code');
    }

    await this.otpRepo.update(row.id, { verified: true, verifiedAt: new Date() });
    return { verified: true };
  }

  /**
   * Called by PublicSignupService.register() right before provisioning --
   * finds a verified, not-yet-consumed, still-in-window row for the email,
   * or throws. Marking it consumed happens separately (markConsumed()),
   * only after CloudTenantsService.provision() actually succeeds, so a
   * mid-provisioning failure leaves the verification usable for a retry
   * rather than burning it on a failed attempt.
   */
  async requireVerified(emailRaw: string): Promise<EmailOtpVerification> {
    const email = this.normalizeEmail(emailRaw);
    const since = new Date(Date.now() - VERIFIED_WINDOW_MINUTES * 60_000);
    const row = await this.otpRepo.findOne({
      where: { email, verified: true, verifiedAt: MoreThan(since), consumedAt: IsNull() },
      order: { verifiedAt: 'DESC' },
    });
    if (!row) {
      throw new BadRequestException(
        'This email has not been verified recently — verify it again before completing sign-up',
      );
    }
    return row;
  }

  async markConsumed(id: string): Promise<void> {
    await this.otpRepo.update(id, { consumedAt: new Date() });
  }
}
