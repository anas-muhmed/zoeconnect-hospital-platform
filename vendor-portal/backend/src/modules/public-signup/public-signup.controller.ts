import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SignupOtpService } from './signup-otp.service';
import { PublicSignupService, PublicSignupResult } from './public-signup.service';
import { CloudTenantsService } from '../cloud-tenants/cloud-tenants.service';

interface RequestOtpBody {
  email: string;
}

interface VerifyOtpBody {
  email: string;
  code: string;
}

interface RegisterBody {
  email: string;
  hospitalName: string;
  adminUsername: string;
  adminFullName?: string;
}

interface CheckAvailabilityBody {
  adminUsername?: string;
  adminEmail?: string;
}

/**
 * Public Self-Service Signup API (2026-07-31) -- unauthenticated by design
 * (there is no session to authenticate: this is how a brand-new customer
 * gets one). The marketing site's /sign-up page is the only intended
 * caller, proxied server-side the same way it already proxies /auth/login
 * to the ZoeConnect backend (see zoeconnect/next.config.mjs) -- never
 * called directly from a browser against this origin.
 *
 * No `@UseGuards` here on purpose: the security boundary for this flow is
 * the OTP verification (SignupOtpService), not a JWT/API-key guard --
 * mirrors how AuthController's /auth/forgot-password on the ZoeConnect
 * backend is also `@Public()` and relies on its own internal
 * rate-limiting/no-enumeration guarantees rather than a session guard.
 */
@Controller('public/signup')
export class PublicSignupController {
  constructor(
    private readonly otpService: SignupOtpService,
    private readonly signupService: PublicSignupService,
    private readonly cloudTenantsService: CloudTenantsService,
  ) {}

  /**
   * CRITICAL FEATURE (production incident, 2026-08 -- live-typing username
   * availability, see zoeconnect/src/components/sign-up-form.tsx and
   * zoeconnect/src/lib/hooks/useFieldAvailability.ts for the frontend side).
   * Unauthenticated for the exact same reason every other route on this
   * controller is (see this controller's own header comment) -- a
   * prospective customer typing a username has no session yet either.
   *
   * Thin wrapper around `CloudTenantsService.checkPublicAvailability()`,
   * which itself calls ZoeConnect's own, single source-of-truth
   * `check-availability` endpoint -- no duplicated availability logic.
   * Safe to call on every keystroke (debounced client-side): read-only,
   * cheap (`SELECT EXISTS`, see AvailabilityCheckService's own doc
   * comment), and reveals nothing beyond a boolean per field.
   */
  @Post('check-availability')
  async checkAvailability(@Body() body: CheckAvailabilityBody) {
    return this.cloudTenantsService.checkPublicAvailability({
      adminUsername: body.adminUsername,
      adminEmail: body.adminEmail,
    });
  }

  @Post('request-otp')
  async requestOtp(@Body() body: RequestOtpBody): Promise<{ ok: true }> {
    return this.otpService.requestOtp(body.email);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpBody): Promise<{ verified: true }> {
    if (!body.code) throw new BadRequestException('Code is required');
    return this.otpService.verifyOtp(body.email, body.code);
  }

  @Post('register')
  async register(@Body() body: RegisterBody): Promise<PublicSignupResult> {
    if (!body.hospitalName?.trim()) throw new BadRequestException('Organization name is required');
    if (!body.adminUsername?.trim()) throw new BadRequestException('Admin username is required');
    return this.signupService.register({
      email: body.email,
      hospitalName: body.hospitalName,
      adminUsername: body.adminUsername,
      adminFullName: body.adminFullName,
    });
  }
}
