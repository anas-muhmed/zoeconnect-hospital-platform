import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Update excludes password (use change-password endpoint instead)
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}

// Admin password reset (super-admin only)
export class AdminResetPasswordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must meet complexity requirements',
  })
  @IsOptional()
  @IsString()
  hisEmployeeCode?: string;
  newPassword?: string;
}
