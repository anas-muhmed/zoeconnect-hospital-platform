import { Body, Controller, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CloudLicensingHmacGuard } from '../licensing/guards/cloud-licensing-hmac.guard';
import { PasswordResetService } from './password-reset.service';
import { User } from '../users/entities/user.entity';

interface CloudPasswordResetDto {
  username: string;
  vendorRequestId: string;
  reason?: string;
}

/**
 * Cloud Security API (architecture review follow-up, 2026-07-31) --
 * the password-reset counterpart of `CloudLicensingController`
 * (`platform/licensing/tenants/:tenantId/subscription`).
 *
 * `VendorGatewayService.approvePasswordResetRequest()` on the Vendor Portal
 * side branches on `hospital.deploymentType`: self-hosted keeps using
 * `executeCommand()` (Remote Admin -- an HMAC-signed HTTP POST to
 * `hospital.publicIp:publicPort`; see that service's `assertSelfHosted()`
 * doc comment for why a cloud tenant can never use that path -- there is no
 * separate physical instance to reach). Cloud tenants call this endpoint
 * instead: same trust domain as Cloud Licensing (Vendor Portal and
 * ZoeConnect Cloud are the same operator), so this is a direct,
 * HMAC-authenticated call rather than a webhook, exactly mirroring
 * `pushCloudEntitlement()` -> `CloudLicensingController`.
 *
 * `@Public()` + `CloudLicensingHmacGuard` -- reused as-is rather than
 * duplicated: the guard's logic (look up `VendorRegistration` by the
 * `:tenantId` route param, verify `X-Vendor-Signature` over the raw body
 * keyed by that registration's `instanceSecret`) has nothing licensing-specific
 * about it, it is simply "prove the caller is Vendor Portal, authorized for
 * this tenant." Registered as a second provider instance here (AuthModule
 * already imports LicensingModule for VendorSyncService, but does not
 * re-export CloudLicensingHmacGuard, and importing it here directly avoids
 * a circular module dependency the same way AuthModule's own
 * `JwtModule.registerAsync()` duplication does -- see license.module.ts's
 * doc comment on that exact tradeoff).
 *
 * Calls `PasswordResetService.applyRemoteReset()` in-process -- the exact
 * same method self-hosted's `CommandDispatcherService` calls for
 * `security:users:reset-password` -- instead of re-implementing temp
 * password generation/hashing/audit logging here. That method requires a
 * real user UUID, not a username (Tenant-Scoped User Identity, Task 7:
 * account-mutating vendor commands are UUID-only so an ambiguous username
 * can never resolve to the wrong tenant's user). Rather than loosening that
 * guarantee, this controller resolves the tenant-scoped username -> UUID
 * itself first, since `:tenantId` here has already been authenticated by
 * the guard above.
 */
@ApiTags('Cloud Security')
@Controller('platform/security/tenants')
export class CloudPasswordResetController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Public()
  @UseGuards(CloudLicensingHmacGuard)
  @Post(':tenantId/password-reset')
  @ApiOperation({ summary: "Apply an approved Super Admin password reset for a cloud tenant's user (Vendor Portal -> ZoeConnect Cloud, HMAC-authenticated)" })
  @ApiHeader({ name: 'X-Vendor-Signature', description: "sha256=<hmac> over the raw request body, keyed by this tenant's VendorRegistration.instanceSecret" })
  async applyPasswordReset(
    @Param('tenantId') tenantId: string,
    @Body() dto: CloudPasswordResetDto,
  ): Promise<{ temporaryPassword: string }> {
    // Tenant-scoped lookup -- CloudLicensingHmacGuard has already proven the
    // caller is authorized for THIS tenantId; scoping the username lookup to
    // it too prevents a shared cloud database from ever resolving a
    // same-named user in a different tenant (the same cross-tenant leak
    // class the tenant-scoping migration elsewhere in this codebase exists
    // to close).
    const user = await this.userRepo.findOne({ where: { username: dto.username, tenantId } });
    if (!user) {
      throw new NotFoundException(`User "${dto.username}" not found in tenant ${tenantId}`);
    }

    return this.passwordResetService.applyRemoteReset(user.id, dto.vendorRequestId, {
      correlationId: dto.vendorRequestId,
      instanceId: `cloud:${tenantId}`,
    });
  }
}
