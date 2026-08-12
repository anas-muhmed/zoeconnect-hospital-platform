import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateMortuaryBillingDto {
  @IsString() bodyId: string;
  @IsOptional() @IsString() cabinAllocationId?: string;

  @Type(() => Number) @IsNumber() totalAmount: number;
  @IsOptional() @Type(() => Number) @IsNumber() discountAmount?: number;
  @IsOptional() @IsString() discountReason?: string;
  @IsOptional() @IsString() concessionAuthorityId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() firstDayCharge?: number;
  @IsOptional() @Type(() => Number) @IsNumber() extraHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() hourlyRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() additionalHourCharges?: number;
  @IsOptional() @Type(() => Number) @IsNumber() totalHours?: number;
  @IsOptional() @Type(() => Number) @IsNumber() advanceAmount?: number;

  @IsOptional() @IsBoolean() staffConcession?: boolean;
  @IsOptional() @IsString() staffName?: string;
  @IsOptional() @IsString() staffEmployeeId?: string;
  @IsOptional() @IsString() staffAddress?: string;
  @IsOptional() @IsString() staffPhone?: string;
  @IsOptional() @IsString() staffRelation?: string;

  @IsOptional() @IsBoolean() bodyDressingRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() bodyDressingCharge?: number;
}
