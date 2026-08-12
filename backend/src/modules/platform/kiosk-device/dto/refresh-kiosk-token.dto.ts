import { IsString, MinLength } from 'class-validator';

export class RefreshKioskTokenDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
