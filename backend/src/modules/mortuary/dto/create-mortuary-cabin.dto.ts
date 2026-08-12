import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMortuaryCabinDto {
  @IsString()
  @IsNotEmpty()
  cabinNumber: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tariff?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  floor?: number;

  @IsOptional()
  @IsIn(['FREEZER', 'NORMAL_CABIN'])
  cabinType?: 'FREEZER' | 'NORMAL_CABIN';
}
