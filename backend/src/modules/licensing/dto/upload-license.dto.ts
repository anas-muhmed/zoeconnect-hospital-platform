import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadLicenseDto {
  @ApiProperty({ description: 'Full signed license JSON from vendor' })
  @IsObject()
  @IsNotEmpty()
  license: Record<string, unknown>;
}
