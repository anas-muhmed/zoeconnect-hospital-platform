import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body shape for `PUT /platform/licensing/tenants/:tenantId/requests/:vendorRequestId/reject`
 * (bug fix, cloud-request-resolution, 2026-07-31) -- the reject-side
 * counterpart to `UpdateSubscriptionLicenseDto`'s `vendorRequestId` field.
 *
 * There's no entitlement change on a rejection (nothing was granted), so
 * this doesn't reuse the subscription-update endpoint -- it's a standalone,
 * equally HMAC-authenticated route whose only job is marking the tenant's
 * own `license_requests` row REJECTED instead of leaving it PENDING
 * forever, which is exactly what was happening for cloud tenants before
 * this fix (self-hosted's equivalent, `REQUEST_REJECTED` over the
 * RSA-signed webhook, has no cloud counterpart to deliver to).
 */
export class RejectCloudRequestDto {
  @ApiPropertyOptional({ description: 'Why the vendor rejected this request -- shown to the hospital.' })
  @IsOptional() @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: "Vendor Portal actor identity (email or user id) who rejected this -- for the audit trail's \"who.\"" })
  @IsOptional() @IsString()
  rejectedBy?: string;
}
