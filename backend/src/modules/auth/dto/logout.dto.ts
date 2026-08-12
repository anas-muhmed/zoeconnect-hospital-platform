import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LogoutReason } from '../enums/logout-reason.enum';

export class LogoutDto {
  @ApiPropertyOptional({ enum: LogoutReason, description: 'The reason for the logout event' })
  @IsEnum(LogoutReason)
  @IsOptional()
  reason?: LogoutReason;
}
