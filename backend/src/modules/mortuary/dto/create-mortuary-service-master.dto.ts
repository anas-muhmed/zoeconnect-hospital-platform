import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMortuaryServiceMasterDto {
  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tariff: number;
}
