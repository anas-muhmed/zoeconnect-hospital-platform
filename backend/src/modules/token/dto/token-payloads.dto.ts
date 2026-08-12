import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  label: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  tokenPrefix?: string;
}

export class CounterActionDto {
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsNumber()
  @IsNotEmpty()
  counterNumber: number;
}

export class CallTokenDto {
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsNumber()
  @IsNotEmpty()
  counterNumber: number;

  @IsNumber()
  @IsNotEmpty()
  tokenNumber: number;
}

export class EnsureServiceCenterDto {
  @IsString()
  @IsNotEmpty()
  serviceCenterId: string;

  @IsString()
  @IsOptional()
  serviceCenterName?: string;

  @IsString()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsOptional()
  departmentName?: string;

  @IsString()
  @IsNotEmpty()
  intrabranchId: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}

export class IssueTokenDto {
  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  departmentName?: string;

  @IsString()
  @IsOptional()
  serviceCenterId?: string;

  @IsString()
  @IsOptional()
  serviceCenterName?: string;

  @IsString()
  @IsOptional()
  intrabranchId?: string;
}

export class ManualResetDto {
  @IsString()
  @IsOptional()
  referenceType?: string;

  @IsString()
  @IsOptional()
  referenceId?: string;
}
