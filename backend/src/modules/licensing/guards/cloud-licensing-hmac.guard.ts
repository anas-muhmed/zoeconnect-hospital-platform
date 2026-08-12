import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import { VendorRegistration } from '../entities/vendor-registration.entity';

/**
 * Service-to-service auth for the Cloud Licensing API
 * (`PUT /platform/licensing/tenants/:tenantId/subscription`) -- deliberately
 * NOT a JWT/user-session guard (there is no user session; the caller is
 * Vendor Portal itself). Reuses the exact HMAC-over-`VendorRegistration.
 * instanceSecret` verification `VendorSyncService.checkWebhookSignature()`
 * already uses for the inbound self-hosted webhook path (`X-Vendor-
 * Signature: sha256=<hmac>` over the raw request body), per the
 * architecture review's explicit instruction to reuse that pattern rather
 * than invent a new auth scheme.
 *
 * Looks the `VendorRegistration` row up by the `:tenantId` route param
 * (not by any header/token) -- this endpoint's whole point is "identify
 * which tenant's entitlements to update from the URL, then prove the
 * caller is allowed to update THIS tenant" rather than a single shared
 * secret for every tenant.
 */
@Injectable()
export class CloudLicensingHmacGuard implements CanActivate {
  constructor(
    @InjectRepository(VendorRegistration)
    private readonly regRepo: Repository<VendorRegistration>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer; tenantIdParam?: string }>();
    const tenantId = (request.params as Record<string, string> | undefined)?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Missing :tenantId route parameter');
    }

    const signatureHeader = request.headers['x-vendor-signature'] as string | undefined;
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing X-Vendor-Signature header');
    }

    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available — ensure rawBody is enabled in Fastify');
    }

    const reg = await this.regRepo.findOne({ where: { tenantId }, order: { registeredAt: 'DESC' } });
    if (!reg) {
      throw new UnauthorizedException('No vendor registration found for this tenant');
    }

    const expected = `sha256=${crypto
      .createHmac('sha256', reg.instanceSecret)
      .update(rawBody)
      .digest('hex')}`;

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
