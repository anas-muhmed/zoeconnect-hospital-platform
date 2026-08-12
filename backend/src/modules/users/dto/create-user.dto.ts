import {
  IsString, IsEmail, IsNotEmpty, MinLength, MaxLength,
  Matches, IsUUID, IsOptional, IsBoolean, IsArray, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType, OmitType } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Username may only contain letters, numbers, dots, hyphens, and underscores' })
  username: string;

  @ApiProperty({ example: 'john.doe@hospital.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional({
  description: 'Mapped HIS Employee Code',
  })
  @IsOptional()
  @IsString()
  hisEmployeeCode?: string;

  @ApiProperty({ description: 'Role UUIDs (at least one required)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  roleIds: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Force password change on first login' })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;

  @ApiPropertyOptional({ description: 'Marks account as a temporary recovery account' })
  @IsOptional()
  @IsBoolean()
  isRecoveryAccount?: boolean;

  @ApiPropertyOptional({ description: 'Expiration date for the account' })
  @IsOptional()
  @IsString() // Can be ISO string
  expiresAt?: string;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}

export class AssignUserPermissionsDto {
  @ApiProperty({ type: [String], description: 'Permission UUIDs to assign directly to this user (replaces existing direct permissions)' })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}

export class AdminResetPasswordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must meet complexity requirements',
  })
  newPassword?: string;
}
