import { IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterKioskDto {
  @IsString()
  @MinLength(1)
  activationCode: string;

  @IsOptional()
  hostname?: string;

  @IsOptional()
  appVersion?: string;
}
