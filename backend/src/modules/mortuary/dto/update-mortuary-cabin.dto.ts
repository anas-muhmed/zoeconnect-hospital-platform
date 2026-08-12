import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMortuaryCabinDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cabinNumber?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tariff?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  floor?: number;

  @IsOptional()
  @IsIn(['FREEZER', 'NORMAL_CABIN'])
  cabinType?: 'FREEZER' | 'NORMAL_CABIN';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRate?: number;
}
