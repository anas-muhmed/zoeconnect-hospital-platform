import { IsString, IsNotEmpty, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body shape for POST /api/v1/license/internal-provision. Previously an
 * inline TS object-literal type on the controller method, which meant the
 * global `ValidationPipe` (main.ts, whitelist + forbidNonWhitelisted) had
 * nothing to validate against — any string values, of any length or shape,
 * were accepted and passed straight to `VendorSyncService.internalProvision()`
 * and then persisted. Field lengths below match `VendorRegistration`'s
 * column definitions (entities/vendor-registration.entity.ts) so a payload
 * this DTO accepts can never violate the entity's own column constraints.
 */
export class InternalProvisionDto {
  @ApiProperty({ description: 'Instance token issued by the vendor platform for this cloud tenant' })
  @IsString() @IsNotEmpty() @MaxLength(64)
  instanceToken: string;

  @ApiProperty({ description: 'HMAC secret issued by the vendor platform for this cloud tenant' })
  @IsString() @IsNotEmpty() @MaxLength(128)
  instanceSecret: string;

  @ApiProperty({ example: 'http://192.168.1.50:4000', description: 'Base URL of the vendor platform API' })
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  vendorApiUrl: string;

  @ApiProperty({ example: 'General Hospital', description: 'Name of the hospital being provisioned' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  hospitalName: string;

  @ApiProperty({ example: 'GH01', description: 'Short code for the hospital' })
  @IsString() @IsNotEmpty() @MaxLength(64)
  hospitalCode: string;
}
