import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMortuaryBodyDto {
  @IsIn(['MLC', 'Non-MLC'])
  bodyType: string;

  @IsOptional() @IsString() hospitalNumber?: string;
  @IsOptional() @IsString() patientName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @IsString() locality?: string;
  @IsOptional() @IsString() dateOfDeath?: string;
  @IsOptional() @IsString() timeOfDeath?: string;
  @IsOptional() @IsString() declaredBy?: string;
  @IsOptional() @IsString() reasonOfDeath?: string;
  @IsOptional() @IsString() deathIntimationNo?: string;
  @IsOptional() @IsString() mlcNo?: string;
  @IsOptional() @Type(() => Number) @IsInt() estimatedDaysOfStay?: number;

  @IsOptional() @IsString() witness1Name?: string;
  @IsOptional() @IsString() witness1Address?: string;
  @IsOptional() @IsString() witness1Contact?: string;
  @IsOptional() @IsString() witness2Name?: string;
  @IsOptional() @IsString() witness2Address?: string;
  @IsOptional() @IsString() witness2Contact?: string;

  /** Required (validated in service, not here) when bodyType === 'MLC'. */
  @IsOptional() @IsString() policeStationName?: string;
  @IsOptional() @IsString() stationSiName?: string;
  @IsOptional() @IsString() presentPoliceOfficerName?: string;

  @IsOptional() freezerRequired?: boolean | 0 | 1 | '0' | '1' | 'true' | 'false';
}

export class UpdateMortuaryBodyDto {
  @IsOptional() @IsIn(['MLC', 'Non-MLC']) bodyType?: string;
  @IsOptional() @IsString() hospitalNumber?: string;
  @IsOptional() @IsString() patientName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @Type(() => Number) @IsInt() age?: number;
  @IsOptional() @IsString() locality?: string;
  @IsOptional() @IsString() dateOfDeath?: string;
  @IsOptional() @IsString() timeOfDeath?: string;
  @IsOptional() @IsString() declaredBy?: string;
  @IsOptional() @IsString() reasonOfDeath?: string;
  @IsOptional() @IsString() deathIntimationNo?: string;
  @IsOptional() @IsString() mlcNo?: string;
  @IsOptional() @Type(() => Number) @IsInt() estimatedDaysOfStay?: number;
  @IsOptional() @IsString() witness1Name?: string;
  @IsOptional() @IsString() witness1Address?: string;
  @IsOptional() @IsString() witness1Contact?: string;
  @IsOptional() @IsString() witness2Name?: string;
  @IsOptional() @IsString() witness2Address?: string;
  @IsOptional() @IsString() witness2Contact?: string;
  @IsOptional() @IsString() policeStationName?: string;
  @IsOptional() @IsString() stationSiName?: string;
  @IsOptional() @IsString() presentPoliceOfficerName?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() billingStatus?: string;
  @IsOptional() freezerRequired?: boolean | 0 | 1 | '0' | '1' | 'true' | 'false';
}
