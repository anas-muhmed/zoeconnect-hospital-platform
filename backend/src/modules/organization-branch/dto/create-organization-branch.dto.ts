import {
  IsString, IsNotEmpty, MaxLength, Matches, IsOptional, IsBoolean, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrganizationBranchDto {
  @ApiProperty({ example: 'West Wing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'west-wing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9._-]+$/, { message: 'code may only contain lowercase letters, numbers, dots, hyphens, and underscores' })
  code: string;

  @ApiPropertyOptional({ description: 'Make this the tenant default branch (unsets any existing default)', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 'active', default: 'active' })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;
}
