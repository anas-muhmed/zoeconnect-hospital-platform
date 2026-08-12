import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, ValidateIf,
} from 'class-validator';

export class SubmitDrugRequestDto {
  @IsIn(['PROMOTIONAL', 'NON_PROMOTIONAL'])
  @IsOptional()
  requestSourceType?: string;

  @IsString() @IsNotEmpty() requestType: string;
  @IsString() @IsNotEmpty() formularyRequestType: string;
  @IsString() @IsNotEmpty() category: string;
  @IsString() @IsNotEmpty() brandName: string;
  @IsString() @IsNotEmpty() genericName: string;
  @IsString() @IsNotEmpty() doseStrength: string;
  @IsString() @IsNotEmpty() dosageForm: string;
  @IsString() @IsNotEmpty() manufacturer: string;
  @IsString() @IsNotEmpty() marketer: string;
  @IsString() @IsNotEmpty() clinicalJustification: string;

  @Type(() => Number) @IsInt() expectedPatientsPm: number;

  @IsOptional() @IsString() existingBrands?: string;
  @IsOptional() @IsBoolean() costReductionBenefit?: boolean;

  @IsOptional() @Type(() => Number) @IsPositive() medicineQuantity?: number;

  // Required only when requestSourceType is PROMOTIONAL — enforced in the service,
  // same conditional-required pattern as the source (source: routes/requests.js POST /).
  @IsOptional() @IsString() medRepName?: string;
  @IsOptional() @IsString() medRepEmail?: string;
  @IsOptional() @IsString() medRepPhone?: string;

  @IsOptional() @IsString() aiContent?: string;
}

export class SubmitPharmacistDrugRequestDto {
  @IsString() @IsNotEmpty() doctorId: string;
  @IsString() @IsNotEmpty() category: string;
  @IsString() @IsNotEmpty() brandName: string;
  @IsString() @IsNotEmpty() genericName: string;
  @IsString() @IsNotEmpty() doseStrength: string;
  @IsString() @IsNotEmpty() dosageForm: string;
  @IsString() @IsNotEmpty() manufacturer: string;
  @IsString() @IsNotEmpty() marketer: string;
  @IsString() @IsNotEmpty() clinicalJustification: string;
  @IsOptional() @IsString() existingBrands?: string;
  @IsOptional() @Type(() => Number) @IsPositive() medicineQuantity?: number;
  @IsOptional() @IsString() aiContent?: string;
}

export class SubmitEmergencyDrugRequestDto {
  @IsString() @IsNotEmpty() requestType: string;
  @IsString() @IsNotEmpty() category: string;
  @IsString() @IsNotEmpty() brandName: string;
  @IsString() @IsNotEmpty() genericName: string;
  @IsString() @IsNotEmpty() doseStrength: string;
  @IsString() @IsNotEmpty() dosageForm: string;
  @IsString() @IsNotEmpty() manufacturer: string;
  @IsString() @IsNotEmpty() marketer: string;
  @IsString() @IsNotEmpty() clinicalJustification: string;
  @IsOptional() @IsString() existingBrands?: string;
  @IsOptional() @IsString() aiContent?: string;

  @IsIn(['PROMOTIONAL', 'NON_PROMOTIONAL'])
  @IsOptional()
  requestSourceType?: string;

  @IsOptional() @IsString() medRepName?: string;
  @IsOptional() @IsString() medRepEmail?: string;
  @IsOptional() @IsString() medRepPhone?: string;
}
