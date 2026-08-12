import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMortuaryAllocationDto {
  @IsString()
  @IsNotEmpty()
  bodyId: string;

  @IsString()
  @IsNotEmpty()
  cabinId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  advanceAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedDaysOfStay?: number;
}

export class ExtendMortuaryAllocationDto {
  @IsString()
  @IsNotEmpty()
  expectedReleaseDateTime: string;
}
