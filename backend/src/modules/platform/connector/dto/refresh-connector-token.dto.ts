import { IsString, MinLength } from 'class-validator';

export class RefreshConnectorTokenDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
