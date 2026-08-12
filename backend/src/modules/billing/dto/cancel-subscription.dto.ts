import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    default: true,
    description: 'true (default): stay active/entitled until currentPeriodEnd, then cancel (CANCEL_AT_PERIOD_END). false: cancel immediately.',
  })
  @IsOptional() @IsBoolean()
  atPeriodEnd?: boolean;
}
