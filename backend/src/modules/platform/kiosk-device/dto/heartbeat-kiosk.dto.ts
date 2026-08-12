import { IsOptional, IsString } from 'class-validator';

export class HeartbeatKioskDto {
  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  hostname?: string;
}
