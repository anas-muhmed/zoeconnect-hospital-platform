import {
  IsString, IsNotEmpty, MaxLength, IsEnum, IsNumber,
  Min, Max, IsOptional, IsDateString, IsBoolean, IsObject, IsInt,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export enum CampaignTypeEnum {
  FESTIVAL  = 'FESTIVAL',
  BIRTHDAY  = 'BIRTHDAY',
  MANUAL    = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'Diwali Special 2x Points' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: CampaignTypeEnum })
  @IsEnum(CampaignTypeEnum)
  campaignType: CampaignTypeEnum;

  @ApiPropertyOptional({ description: 'Campaign start date (ISO 8601)', example: '2024-10-28T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Campaign end date (ISO 8601)', example: '2024-11-05T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Points earn multiplier (1 = no multiplier)', example: 2 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  earnMultiplier?: number;

  /** @deprecated use earnMultiplier */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  multiplier?: number;

  @ApiPropertyOptional({ description: 'Flat bonus points on every earn event', example: 50 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  bonusPointsFlat?: number;

  /** @deprecated use bonusPointsFlat */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  bonusPoints?: number;

  @ApiPropertyOptional({
    description: 'Card tier codes that are eligible for this campaign (e.g. ["SILVER","GOLD"]). Empty = all tiers.',
    type: [String],
    example: ['GOLD', 'PLATINUM'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleCardCodes?: string[];

  @ApiPropertyOptional({ description: 'Additional conditions (JSON)' })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
