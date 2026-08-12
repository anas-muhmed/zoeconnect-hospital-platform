import { IsUUID, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RedeemRewardDto {
  @ApiProperty({ description: 'Loyalty account ID' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Reward catalog item ID' })
  @IsUUID()
  rewardId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ProcessRedemptionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'FULFILLED'] })
  @IsString()
  status: 'APPROVED' | 'REJECTED' | 'FULFILLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AdjustPointsDto {
  @ApiProperty({ description: 'Loyalty account ID' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Points to add (positive) or subtract (negative)', example: 100 })
  points: number;

  @ApiProperty({ description: 'Reason for adjustment' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
