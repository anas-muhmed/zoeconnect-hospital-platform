import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsBoolean, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TARGET_TYPES = ['HOSPITAL', 'BRANCH', 'DEPARTMENT', 'PHARMACY', 'LABORATORY', 'BILLING', 'RECEPTION', 'DOCTOR', 'CUSTOM'];

export class CreateQrCodeDto {
  @ApiProperty({ description: 'Campaign this QR code resolves to' })
  @IsUUID()
  campaignId: string;

  @ApiProperty({ example: 'Front Desk QR - Main Branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ApiProperty({ enum: TARGET_TYPES })
  @IsString()
  @IsIn(TARGET_TYPES)
  targetType: string;

  @ApiPropertyOptional({ description: 'Free-text descriptor, e.g. department or doctor name -- display-only' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  targetRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateQrCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ enum: TARGET_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(TARGET_TYPES)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  targetRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
