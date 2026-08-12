import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveDrugRequestDto {
  @IsOptional() @IsString() remarks?: string;
}

export class RejectDrugRequestDto {
  @IsString() @IsNotEmpty() remarks: string;
}

export class InitialReviewApproveDto {
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() effectiveCreatedAt?: string;
}

export class UpdateDrugInfoDto {
  @IsOptional() @IsString() genericName?: string;
  @IsOptional() @IsString() doseStrength?: string;
  @IsOptional() @IsString() dosageForm?: string;
}

export class RevertDrugRequestDto {
  @IsString() @IsNotEmpty() remarks: string;
}

export class MarkInventoryAddedDto {
  @IsOptional() @IsString() inventoryItemName?: string;
}
