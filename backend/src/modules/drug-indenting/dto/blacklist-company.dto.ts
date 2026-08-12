import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBlacklistedCompanyDto {
  @IsString() @IsNotEmpty() companyName: string;
  @IsIn(['MANUFACTURER', 'MARKETER']) companyType: string;
  @IsOptional() @IsString() remarks?: string;
}
