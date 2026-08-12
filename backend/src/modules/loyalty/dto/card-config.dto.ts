import {
  IsNumber, IsOptional, IsBoolean, IsString, IsArray,
  ValidateNested, Min, Max, IsHexColor, Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DiscountThresholdDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  min_value: number;           // card monetary value in Rs. (e.g. 300)

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount_pct: number;        // discount percentage (e.g. 3)
}

export class UpdateCardCategoryDto {
  @ApiPropertyOptional({ description: 'Minimum lifetime spend (Rs.) for this tier', example: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  minSpend?: number;

  @ApiPropertyOptional({ description: 'Maximum lifetime spend (Rs.) for this tier — null = no cap', example: 99999.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  maxSpend?: number | null;

  @ApiPropertyOptional({ description: 'Points earned per Rs.100 of bill', example: 1 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  @Type(() => Number)
  earnRatePer100?: number;

  @ApiPropertyOptional({ description: 'Monetary value (Rs.) of 100 points', example: 25 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  pointValuePer100?: number;

  @ApiPropertyOptional({
    description: 'Discount threshold brackets [{min_value, discount_pct}, ...]',
    type: [DiscountThresholdDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountThresholdDto)
  discountThresholds?: DiscountThresholdDto[];

  @ApiPropertyOptional({ description: 'Card colour hex code', example: '#C0C0C0' })
  @IsOptional()
  @IsString()
  @Length(4, 7)
  colourHex?: string;

  @ApiPropertyOptional({ description: 'Whether this tier is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
