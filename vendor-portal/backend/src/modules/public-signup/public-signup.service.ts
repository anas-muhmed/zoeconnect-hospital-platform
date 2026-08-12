import { Injectable, Logger } from '@nestjs/common';
import { SignupOtpService } from './signup-otp.service';
import { CloudTenantsService } from '../cloud-tenants/cloud-tenants.service';

export interface PublicSignupDto {
  email: string;
  hospitalName: string;
  adminUsername: string;
  adminFullName?: string;
}

export interface PublicSignupResult {
  hospitalName: string;
  adminUsername: string;
  adminEmail: string;
  tempPassword: string;
  loginUrl: string | null;
  provisioningStatus: string;
}

@Injectable()
export class PublicSignupService {
  private readonly logger = new Logger(PublicSignupService.name);

  constructor(
    private readonly otpService: SignupOtpService,
    private readonly cloudTenantsService: CloudTenantsService,
  ) {}

  /**
   * The self-service counterpart of the Vendor Portal admin's "Provision
   * Cloud Tenant" button -- deliberately calls the exact same
   * `CloudTenantsService.provision()` used there (same
   * cloud_tenants row, same call out to ZoeConnect's
   * /platform/tenant-provisioning, same linked `hospitals` row), so a
   * self-service signup is indistinguishable from a vendor-provisioned one
   * in every Vendor Portal screen afterward. The only thing this layer adds
   * is: (1) requiring a recently-verified OTP for the email first, since
   * this endpoint has no admin session behind it, and (2) sanitizing the
   * response -- `provision()`'s return type is the full `CloudTenant` row,
   * which includes `instanceSecret`/`instanceToken` that must never reach
   * an unauthenticated caller.
   */
  async register(dto: PublicSignupDto): Promise<PublicSignupResult> {
    const verification = await this.otpService.requireVerified(dto.email);

    const tenant = await this.cloudTenantsService.provision({
      hospitalName: dto.hospitalName,
      adminUsername: dto.adminUsername,
      adminEmail: dto.email,
      adminFullName: dto.adminFullName,
    });

    await this.otpService.markConsumed(verification.id);

    this.logger.log(`Self-service signup completed for ${dto.adminUsername} (${dto.email}) -- hospital="${dto.hospitalName}"`);

    return {
      hospitalName: tenant.hospitalName,
      adminUsername: tenant.adminUsername,
      adminEmail: tenant.adminEmail,
      tempPassword: tenant.tempPassword,
      loginUrl: tenant.loginUrl ?? null,
      provisioningStatus: tenant.provisioningStatus,
    };
  }
}
