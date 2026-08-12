import { IsIn, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMortuaryBillingSettingsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstDayCharge: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyChargeAfter24hrs: number;

  @IsOptional()
  @IsIn(['tiered_flat_hourly', 'flat_daily', 'free'])
  pricingModel?: 'tiered_flat_hourly' | 'flat_daily' | 'free';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  staffDiscountPercent?: number;
}
