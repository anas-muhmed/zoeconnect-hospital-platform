import {
  IsString, IsNotEmpty, MaxLength, IsNumber, Min, IsOptional, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EarnPointsDto {
  @ApiProperty({ description: 'Patient MRN or loyalty account card number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  identifier: string;             // MRN or card number — service resolves to account

  @ApiProperty({ description: 'Bill number from HIS', example: 'BILL-2024-001234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  billId: string;

  @ApiProperty({ description: 'Bill total amount in INR', example: 15000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  billAmount: number;

  @ApiPropertyOptional({ description: 'Override points (for manual adjustment; requires ADJUST permission)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  overridePoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
